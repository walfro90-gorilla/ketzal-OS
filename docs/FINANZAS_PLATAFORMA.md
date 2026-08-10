# Finanzas de plataforma — ledger balance-0 y Mercado Pago Split

> Construido el 2026-08-04 (carril `finanzas-split`, migraciones b052–b053,
> commit `e20cb46`). Split **activado y validado en vivo el 2026-08-10**
> (primera agencia conectada). Contexto y decisiones en la memoria
> `finanzas-plataforma`.

## El problema que resuelve

Ketzal OS **devengaba** (motor de comisiones b019: asientos por venta) pero nunca
**liquidaba**: todo el dinero real caía en cuentas del fundador (token MP único +
CLABE de Wanderlust) y las "ganancias de Ketzal" eran papel sin proceso de cobro.
Funciona con un solo bolsillo; truena al entrar la primera agencia ajena.

## Ledger balance-0 (`ketzal.ledger_entries`, b052)

- **Doble partida**: cada movimiento es un GRUPO de asientos cuya suma es 0
  (`ledger_post` lo valida y es la ÚNICA vía de escritura — revocada para
  authenticated; tabla deny-all + append-only con `no_mutar`).
- **Cuentas por actor**: `plataforma` · `agencia` (supplier) · `embajador` /
  `viajero` (profile). Saldo + = se le debe; − = debe.
- **Espeja, no recrea** (regla clave anti-doble-contabilidad):
  - `commission_lines` (motor b019) → trigger `ledger_mirror_commission`:
    payee a favor / agencia vendedora a cargo (reverso invierte; autopago se
    omite). Backfill histórico incluido (verificado: 10 asientos, suma $0.00).
  - Los créditos de cancelación (b049 `credits`) NO se recrean — su fuente es
    su tabla; asientos método `'credito'` = transferencia interna, no cash.
- **Registro ≠ custodia**: el dinero real sigue en MP/SPEI. El ledger lleva
  derechos/obligaciones. Créditos internos redimibles ≠ saldos retirables
  (línea roja fintech/CNBV).
- **RPCs**: `ledger_summary()` (saldos; superadmin todo, admin su agencia,
  persona su profile) · `ledger_statement(...)` (movimientos, mismos guards) ·
  `settle_ledger(...)` (superadmin: cierra saldo contra plataforma cuando el
  dinero se movió por fuera).
- **UI `/cuentas`** (nav, adminOnly): cards por cuenta con saldo/movimientos +
  detalle con link a la venta + botón Liquidar (superadmin).

## Cómo fluye cada método de pago

| Método | Dinero real | Asientos del ledger |
|---|---|---|
| **MP con split** (agencia conectó su cuenta) | Directo a la agencia; MP retiene el fee para Ketzal | `fee_cobrado_split` (+agencia −plataforma) — cierra el cargo del devengo al instante |
| **MP sin split** | Cae a la cuenta MP de Ketzal | `cobro_por_cuenta` (−plataforma +agencia, `available_at` = +7 días) — payout manual al cumplirse |
| **SPEI directo / efectivo cajero** | Directo a la CLABE de la agencia | Nada extra: el cargo del fee es el espejo del devengo — queda por cobrar a la agencia |

En todos los casos el **devengo** del fee (10%, `platform_commission_rate`) lo
genera el motor por venta y el espejo lo hace visible. El split solo cambia
CUÁNDO se cobra (al instante vs corte).

## Mercado Pago Split (b053)

- **`ketzal.mp_accounts`**: tokens OAuth del vendedor por agencia. **Deny-all**
  (solo service_role) — jamás en `suppliers.info` (alimenta RPCs públicos).
- **OAuth**: `/api/mp/oauth/start?supplier=` (guard admin de la agencia o
  superadmin; `state` FIRMADO con HMAC — el callback rechaza ids arbitrarios) →
  MP → `/api/mp/oauth/callback` (intercambia code, guarda vía service role).
- **Checkout** (`crearLinkPagoMarketplace`): si la vendedora tiene cuenta →
  preferencia con SU `access_token` + `marketplace_fee` (fee% del monto) e
  `intent.split=true/mp_fee`; si no → flujo actual con el token de plataforma.
- **Webhook**: los pagos split dan 404 con el token de plataforma → fallback
  probando los tokens de `mp_accounts` (pocas agencias).
- **`confirm_online_payment`** (re-apply, firma intacta): postea los asientos
  según `intent.split` (best-effort: un fallo del ledger se loguea en
  system_log y NO tumba el cobro).
- **UI**: card "Cobros en línea (Mercado Pago)" en `/proveedores/[id]`
  (agencias): estado conectado / botón conectar + aviso del payout a 7 días.
- **Envs**: `MP_CLIENT_ID` + `MP_CLIENT_SECRET` (app marketplace que el
  fundador crea en el panel de MP). Sin ellas: botón responde 501 y todo opera
  como hoy. **Puestas en Vercel producción (2026-08-06/07) desde la app
  `Ketzal_app` (id 8055388991453386) del propio Mercado Pago del fundador.**
- **Redirect URI** de `Ketzal_app` configurado en el panel de MP
  (`https://ketzal-os.vercel.app/api/mp/oauth/callback`, sección
  "Configuración avanzada" → "URL de redireccionamiento"; solo aparece con
  al menos un flujo OAuth declarado) — **2026-08-10**. Sin este paso el OAuth
  truena con `invalid redirect_uri`; no hay endpoint de la Management API de
  MP para ponerlo por MCP/script, es manual en el panel, una vez por app.

### Validado en producción (2026-08-10)

Connect real de **Wanderlust Travels Jrz** vía `/proveedores/[id]` → "Conectar
mi Mercado Pago" → pantalla de autorización de MP → callback. Resultado:
`mp_accounts` con `mp_user_id=479630144` (mismo MP user que procesó el pago
SPEI de prueba de $20 validado en 2026-07-10), `live_mode=true`,
`access_token`/`refresh_token`/`public_key` presentes, deny-all confirmado
(RLS on, sin policies, sin GRANT a `anon`/`authenticated` — solo
`postgres`/`service_role`). Regresión: `verificar_invariantes()` 0
violaciones, `ledger_entries` suma $0.00 (10 asientos, plataforma
+$1,850.50 sin cambio — el connect no postea asientos, solo habilita el
split de la próxima venta en línea), advisors security 0 ERROR, `tsc`+
`vitest` (75 tests) limpios. **Aún no se ha corrido una venta real con el
split activo** — el connect en sí no mueve dinero.

## Coordinación (re-applies y reglas)

- `confirm_online_payment`: conservar `p_method` (webhook 3 args) **y** el
  bloque de asientos del ledger (split / cobro_por_cuenta).
- `ledger_entries` SOLO se escribe vía `ledger_post` (trigger/RPC) — nunca
  insert directo; nunca UPDATE/DELETE (append-only; corrección = asiento).
- El saldo del ledger NO se deriva de columnas escribibles por el cliente
  (lección b051).
- Guards SQL siempre con `coalesce(..., false)` (lección b041).
- Kinds del ledger: `devengo · reverso · fee_cobrado_split · cobro_por_cuenta ·
  payout · liquidacion · ajuste` — agregar uno = ampliar el CHECK.

## Pendientes

- **Conectar a las demás agencias** (Border Travels y las que se den de alta)
  repitiendo "Conectar mi Mercado Pago" en su `/proveedores/[id]`. Sin
  conectar, sus ventas en línea siguen con `cobro_por_cuenta` (payout a 7
  días) — sigue funcionando, solo cambia el timing.
- **Primera venta real con split** — validar que `fee_cobrado_split` postea
  bien contra una venta de Wanderlust cobrada en línea.
- F3 créditos del viajero en `wallets` (espejando `credits`), payout
  automatizado, corte mensual del devengo a agencias ajenas — ver memoria
  `finanzas-plataforma`.
