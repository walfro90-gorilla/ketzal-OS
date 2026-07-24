# Motor de comisiones — asiento por beneficiario

> Plan de ejecución. Rama `worktree-comisiones-motor`. Carril backend (`bNNN_`).

## Contexto — por qué

Hoy Ketzal gana dinero de **una** forma: `total × rate / 100`, con la fórmula
**duplicada en 3 RPCs** (`commissions_summary`, `reports_summary`,
`payables_summary`) y dos tasas mutables (`suppliers.commission_rate`,
`app_settings.platform_commission_rate`). Esto tiene 3 huecos reales:

1. **El marketplace B2C no deja comisión.** `create_marketplace_order` inserta
   `selling = owner = agencia`, y los RPCs de comisión exigen `selling is null`
   o `owner <> selling` ⇒ la venta que Ketzal origina, cobra por MP y opera se
   registra como venta directa de la agencia, **sin corte para Ketzal**.
2. **La comisión no está congelada.** Se recalcula al leer. Cambiar una tasa
   reescribe el pasado: reportes de meses cerrados y —peor— la CxP al mayorista
   (`payables_summary`) sobre ventas ya liquidadas. Contradice el espíritu de la
   regla de oro #3 (ledger inmutable).
3. **Un solo beneficiario por venta.** El fundador va a sumar **embajadores** que
   venden y cobran **$X por viajero**. Una venta del marketplace puede pagar a la
   vez: % a la agencia revendedora + tarifa de Ketzal + $X/pax al embajador.
   **Tres cobradores, tres bases, un booking.** Un campo `commission_amount` no
   lo aguanta.

Momento correcto: **balance 0** (0 suppliers/services/bookings/payments en prod,
verificado). Cero backfill ⇒ se migra el esquema gratis. Pero es el peor momento
para fijar el **monto** (no hay una venta con la cual saber si $500/pax deja
margen) ⇒ el número vive en config editable; el payout al embajador se construye
cuando exista un embajador real.

## Decisiones (cerradas con el fundador)

| Tema | Decisión |
|---|---|
| Cantidad fija por servicio | Sirve a **ambos** flujos (tarifa plataforma **y** trato inter-agencia), mismo motor |
| Base del monto fijo | **Por pasajero** (`num_pax`), con `basis` configurable (percent / fijo_venta / fijo_pax) |
| Congelar comisión | **Sí**, snapshot como asiento al cerrar la venta |
| Embajador opera | **Ambos**: refiere por link **y** (a futuro) vende dentro del OS |
| Quién paga al embajador | **Ketzal, de su corte de plataforma** (la agencia dueña no lo ve) |
| Tarifa del embajador | **Varía por servicio** |

## Diseño — la comisión deja de ser un número derivado y pasa a ser un asiento

### Tabla nueva `ketzal.commission_lines` (append-only, N filas por venta)
Una fila **por beneficiario por venta**. Es el snapshot: congela sola.

```
id                uuid pk
booking_id        uuid not null → bookings
payee_type        text  check in ('plataforma','agencia','embajador')
payee_supplier_id uuid  null → suppliers   -- null = Ketzal plataforma
basis             text  check in ('percent','fijo_venta','fijo_pax')
rate              numeric(5,2)  null        -- si percent
unit_amount       numeric(12,2) null        -- si fijo_*
num_pax           int   not null
amount_mxn        numeric(12,2) not null check (>= 0)
kind              text  check in ('devengo','reverso') default 'devengo'
reverses_line_id  uuid  null → commission_lines
created_at        timestamptz default now()
```
- **RLS SELECT** = visibilidad de la venta (`EXISTS bookings` con la misma regla
  que `commissions_summary`) + superadmin ve plataforma.
- **Inmutable** (regla de oro #3): trigger `no_mutar` + `REVOKE update,delete,truncate`.
  Corrección = fila `kind='reverso'`, nunca UPDATE/DELETE.
- **Escritura** solo vía trigger/RPC: `REVOKE insert` de `authenticated`.
- Unique parcial: un `devengo` por `(booking, payee_type, coalesce(payee_supplier_id,zero))` sin reverso.

### Tabla nueva `ketzal.commission_rules` (config de tarifas — el "cuánto")
Cubre las dos peticiones originales (% fijo global + **cantidad fija por servicio**)
y la tarifa del embajador por servicio, con una sola forma.

```
id                uuid pk
service_id        uuid null → services   -- null = regla general (fallback)
payee_type        text check in ('plataforma','agencia','embajador')
payee_supplier_id uuid null → suppliers  -- embajador/agencia específica
basis             text check in ('percent','fijo_venta','fijo_pax')
rate              numeric(5,2)  null
unit_amount       numeric(12,2) null
active            bool default true
created_at        timestamptz
```
- **Resolver** (función `resolve_commission_rule`): gana la más específica
  (`service_id` + `payee` match) sobre la general; si no hay regla, cae al
  legacy `suppliers.commission_rate` (agencia) / `app_settings.platform_commission_rate`
  (plataforma) como `basis='percent'`. **Cero pérdida de comportamiento actual.**
- **RLS write**: reglas `plataforma` y `embajador` = solo superadmin (Ketzal paga
  al embajador de su corte); reglas `agencia` = la agencia dueña o superadmin.

### Snapshot: trigger `tg_commission_snapshot` — AFTER INSERT OR UPDATE OF status ON bookings
Único choke point que atrapa **ambos** flujos: la venta del OS nace `reserved`
(AFTER INSERT) y la del marketplace pasa `draft→reserved` en `confirm_online_payment`
(AFTER UPDATE). **No toca** `create_booking_with_items` ni `confirm_online_payment`.

- Dispara si `NEW.status in ('reserved','confirmed','paid')` y **no existen** líneas
  para el booking (idempotente).
- Inserta línea **plataforma** si `selling_supplier_id is null` (agente libre) **o**
  `marketplace_customer_id is not null` (venta B2C). **← cierra el hueco #1.**
- Inserta línea **agencia** si `owner_supplier_id <> selling_supplier_id` (reventa).
- **No** inserta la del embajador aquí (su `ambassador_id` puede llegar aparte).

### `set_booking_ambassador(p_booking uuid, p_ambassador uuid)` — RPC INVOKER guardado
La línea del embajador se **agrega** al ledger (append-only ⇒ sumar una fila
después es consistente), sin recomputar las demás.
- Guard: el que llama ve la venta (RLS) / es la agencia operadora / superadmin.
- Resuelve la tarifa embajador para `(service, ambassador)` vía `resolve_commission_rule`.
- Inserta **una** línea `embajador` (idempotente: no repite si ya existe). Setea
  `bookings.ambassador_id`.
- **Invariante**: tras agregar, `Σ amount_mxn (devengo−reverso) ≤ booking.total`,
  si no `raise`.
- Lo llama el checkout del marketplace con el `?ref` y (a futuro) el form del OS.

### Columna aditiva `bookings.ambassador_id uuid null → suppliers`
Etiqueta de atribución, **no** campo de tenancy (no toca `selling_supplier_id`).
El embajador es una fila `suppliers` `supplier_type='embajador'` + `referral_code`
(columna nueva `suppliers.referral_code text unique null`).

### Categoría `embajador` en `expenses` (F2)
Extiende el CHECK de `expenses.category` (7 → 8) para pagar al embajador por el
**ledger de egresos ya existente**. CxP embajador = `Σ` líneas embajador `−`
`Σ` egresos `category='embajador'` — calco de `payables_summary` del mayorista.

### Guardrail obligatorio
`verificar_invariantes` **+1 check** (aditivo, coordinar): por venta,
`Σ commission_lines (devengo−reverso) ≤ booking.total`. Hoy **nada** impide que
15% + 10% + $500×4 se coman la venta.

## Fases

**Fase 1 — esquema — ✅ COMPLETA + hard-testeada (2026-07-23, rama `worktree-comisiones-motor`).**
Aplicada a `wnujoyzdpdyxblgdtxjw` (migraciones `ketzal_commission_engine_v1` +
`_guard_fix` + `_advisor_cleanup`; espejo `db/proposed/b019_comisiones_motor.sql`).
Objetos nuevos: tablas `commission_lines` (asiento, inmutable) + `commission_rules`
(config), columnas `bookings.ambassador_id` / `suppliers.referral_code`, categoría
`embajador` en `expenses`, funciones `commission_amount` / `resolve_commission_rule`
/ `tg_commission_snapshot` (trigger) / `set_booking_ambassador`, y +1 check en
`verificar_invariantes` (`comision_excede_venta`, aditivo). **Bug encontrado y
cerrado en el hard-test**: el guard de `set_booking_ambassador` usaba `OR` con
`selling = my_supplier_id()`, que da `NULL` cuando el que llama no tiene agencia,
y `if not NULL` no dispara ⇒ un autenticado suelto pasaba el guard. Corregido con
`coalesce(...,false)` + se habilitó al comprador del marketplace sobre su propia
venta (para el `?ref`). **Hard-test replayable** en `supabase/tests/comisiones_motor.sql`
(15 checks, todo en rollback): snapshot por flujo (directa=0 / reventa=agencia cobra
revendedor 12% / libre=plataforma 10% / **marketplace=plataforma ← hueco #1 cerrado**),
embajador add/idempotente/invariante/sin-tarifa/no-embajador, inmutabilidad (DELETE
bloqueado), guard NULL-safe, self-attribution del comprador. **Advisors: 0 ERROR**
(los WARN de funciones DEFINER son baseline del repo). Prod sigue en balance 0 (todo
revertido). **NO** se tocó `create_booking_with_items`, `confirm_online_payment`,
`reports_summary` ni `database.types.ts`.

Detalle de lo aplicado:
1. Migración `ketzal_commission_engine_v1` (aplicar + espejo `db/proposed/b019_comisiones_motor.sql`):
   `commission_lines` + `commission_rules` (RLS + inmutabilidad + REVOKE/GRANT),
   `bookings.ambassador_id`, `suppliers.referral_code`, `resolve_commission_rule`,
   `tg_commission_snapshot`, `set_booking_ambassador`, `expenses` categoría `embajador`.
2. `verificar_invariantes` re-aplicado aditivo (+ check `comision_excede_venta`).
3. **Hard-test SQL en vivo (rollback)**: venta libre → línea plataforma; reventa →
   línea agencia; marketplace → línea plataforma (hueco #1 cerrado); `set_booking_ambassador`
   agrega 1 línea idempotente; snapshot inmutable (DELETE bloqueado); invariante
   dispara si Σ > total; RLS aislada entre agencias; advisors 0 ERROR.

**Fase 2 — config por servicio — ✅ SLICE 1 HECHO (2026-07-23, misma rama).**
Lo que el fundador pidió: **cuánto gana Ketzal por servicio** (override del % global).
- BD: RPC `set_commission_rule(service, payee_type, scope, basis, rate, unit)`
  (migración `ketzal_set_commission_rule`, espejo `db/proposed/b020_set_commission_rule.sql`),
  SECURITY DEFINER, guard = calco de las policies (superadmin, o la agencia dueña
  para reglas 'agencia'); atómico (desactiva la activa + inserta); `basis=null` limpia.
  Sirve a los 3 payee_type; la UI hoy solo usa 'plataforma'.
- App: `/comisiones` gana card **"Ganancia de Ketzal por servicio"** (solo superadmin):
  por servicio elige *Usar % global / % propio / Fijo por venta / Fijo por pasajero*
  (`reglas-servicio.tsx` + `reglas-actions.ts`). Hard-test SQL (rollback, 7 checks:
  set/cambia/una-sola-activa/resolver/limpiar-a-legacy/guard-agencia-no-plataforma/
  agencia-sí-su-regla). `tsc`+`build`+57 tests de dominio limpios.

**Fase 2 slice 2 (alta de embajadores) — ✅ HECHO (2026-07-23, misma rama).**
El form de `/proveedores` gana el tipo **Embajador** + campo **Código de referido**
(`referral_code`, opcional, normalizado A-Z0-9_- 3–32, unique con mensaje claro al
chocar). Sin migración (la columna `referral_code` ya existe de b019). Ahora que un
embajador puede existir, el flujo cierra end-to-end: crear embajador+código →
`set_commission_rule(payee_type='embajador')` fija su tarifa por servicio →
`set_booking_ambassador` atribuye → línea. Smoke-test SQL (rollback, 4 checks:
código duplicado bloqueado / tarifa por servicio / línea 200×3=600 / lookup por
código). tsc+build limpios. Archivos: `proveedores/{actions,proveedor-form,proveedores-list}.tsx`
+ `[id]/page.tsx`.

**Fase 2 slice 3 (tarifas de embajador) — ✅ HECHO (2026-07-23, misma rama).**
`/comisiones` gana card **"Tarifas de embajador"** (solo superadmin): selector de
embajador + tarifa por servicio (fijo por pasajero / fijo por venta / % de la venta /
sin tarifa). Reusa la RPC `set_commission_rule` con `payee_type='embajador'`, scope =
el embajador; el `ReglaRow` se generalizó y lo comparten el editor de plataforma y el
de embajador (`reglas-servicio.tsx` + `guardarReglaEmbajador` en `reglas-actions.ts`).
Sin migración. Sanity-test SQL (rollback: write 2 reglas / read con la query de la
página / cambio deja 1 activa / limpiar la quita). tsc+build limpios.

**Fase 2 slice 4 (atribución `?ref` del marketplace) — ✅ HECHO (2026-07-23, misma rama).**
El comprador que llega por link de embajador (`/servicio/[id]?ref=CODIGO`) queda
atribuido automáticamente al comprar. BD: RPC **`attribute_booking_by_ref(booking, code)`**
(DEFINER, migración `ketzal_attribute_booking_by_ref`, espejo `db/proposed/b021_attribute_by_ref.sql`)
— **best-effort**: clon tolerante de `set_booking_ambassador` que resuelve el código
(`suppliers.referral_code`, normalizado) y estampa la línea, pero **nunca rompe la
compra** (código inexistente / sin tarifa / venta ajena / excede total ⇒ no-op sin
raise); reusa `resolve_commission_rule`+`commission_amount`, idempotente. App: el CTA
de `/servicio` propaga `?ref`; `/comprar` lo lee → `PedidoForm` (respaldo en
localStorage para sobrevivir registro/confirmación) → `crearPedido` lo pasa y atribuye
tras crear el pedido. Hard-test SQL (rollback): normaliza y atribuye (150×2=300 +
`ambassador_id`), idempotente, código inexistente / sin tarifa / extraño = no-op.
tsc+build limpios, advisors 0 ERROR.

**Fase 2 — pendiente (cuando haya datos):**
- Reescribir `commissions_summary` para leer `commission_lines` (separa **ganado**
  `payee=yo` de **costo** ⇒ arregla hueco #3), cubre marketplace. *Diferido*: hoy
  balance 0 ⇒ la lista está vacía; el rewrite cambia semántica sin upside inmediato.
- RPC `ambassador_payables_summary` (Ketzal, superadmin) + `/gastos` pago al embajador
  (`category='embajador'` prellenada). *Diferido*: no hay embajador ni línea que pagar.

**Diferido (no hay embajador real todavía):**
- Embajador se loguea al OS a vender (gating de nav/shell).
- Reescribir `reports_summary` para leer del ledger (**hub compartido** — coordinar
  con el otro agente; hoy queda con su cálculo derivado, divergencia aceptada).

## Coordinación multi-agente
Todo son **objetos nuevos** + columnas/CHECKs aditivos. **NO** se toca
`create_booking_with_items`, `confirm_online_payment`, `reports_summary` ni
`database.types.ts` (RPCs nuevos con cast `as never`). Solo `verificar_invariantes`
se re-aplica aditivo — conservar el check `comision_excede_venta` si el otro agente
lo re-aplica. Espejo en `db/proposed/b019_comisiones_motor.sql`.

## Verificación
- SQL hard-test arriba (en vivo, revertido, agencias QA).
- `supabase/tests/` nuevo script si aplica; `get_advisors` = 0 ERROR.
- Tests de dominio (`pnpm test`): extraer el cálculo `amount_from_rule(basis, rate,
  unit, num_pax, total)` a `src/lib/domain/commission.ts` puro + `.test.ts`
  (percent/fijo_venta/fijo_pax + redondeo), patrón senior del repo.
- `tsc` + `next build` limpios.
