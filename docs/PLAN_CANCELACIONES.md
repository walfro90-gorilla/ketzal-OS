# Plan de implementación — Política de cancelaciones (carril `cancelaciones`)

> Aterriza la investigación de `docs/POLITICA_CANCELACION.md` en fases construibles.
> Estado: **PLAN — nada implementado**. Decisiones del §8 **CERRADAS (2026-08-04)**: tramos 10/25/50/75/100 con piso = enganche (efectivo 20/25/50/75/100), **crédito 100% (12 meses) ofrecido SIEMPRE antes que la devolución**, cambio de fecha 1º gratis ≥20 días, aviso mínimo pax 7 días, atraso de plan 15 días, pena en reventas proporcional a comisión, política default + override por agencia. Único pendiente externo: abogado/PROFECO (no bloquea).
>
> Contexto actualizado (2026-08-04, main @ d939204): el marketplace ya opera pedidos reales — `/comprar/[serviceId]`, `(travel)/mis-compras`, pagos MP + **SPEI con aprobación** (b034–b038), plan de abonos del pedido (b039), notificaciones (b036), seat map/abordaje (b041–b043). La política debe cubrir **ambos carriles**: venta con agente (OS) y pedido del marketplace. Siguiente migración backend: **b048** (b045 temporadas y b046 buslist son del otro carril; C1 usó b047).

## Principios (heredados de las reglas de oro)

1. **La política se congela en la venta** (snapshot jsonb en `bookings`), igual que el precio. Cambiarla después no cambia lo pactado.
2. **La pena NO es un asiento**: retener = simplemente no reembolsar. El ledger sigue append-only; el reembolso (total o parcial) es asiento `refund` como siempre.
3. **Aceptación con evidencia** (timestamp + canal + ip cuando aplique) — es la defensa legal y anti-contracargo. Sin aceptación registrada, la política no protege.
4. **Cero re-apply de RPCs compartidos**: `create_booking_with_items`, `get_quote_by_token`, `confirm_online_payment`, `list_my_marketplace_orders`, `verificar_invariantes` NO se tocan. Todo entra por RPCs nuevos e independientes (patrón `get_public_doc_currency` de F6).
5. Convenciones del árbol: RPCs nuevos con cast `as never`, `database.types.ts` intacto, espejos en `db/proposed/bNNN_`, hard-test en vivo con rollback bajo agencias QA, advisors 0 ERROR.

---

## C0 — Texto y página pública (sin BD, sin dinero)

**Objetivo:** que la política exista como documento visible y enlazable ANTES de que el código la aplique.

- Redactar el texto v1 con los números que decida Walfre (base: tabla §4 del doc de investigación) — incluye el espejo "si cancelamos nosotros" (NOM reciprocidad) y la regla USD→MXN autoritativo.
- Página estática **`/politica-cancelacion`** con el layout público compartido (`src/components/public/`), link en el footer público y en la ficha `/servicio/[id]`.
- `proxy.ts`: agregar `/politica-cancelacion` a la allowlist (mismo fix que `/agencias`).
- Fuera de código: abogado + contrato de adhesión + registro PROFECO (corre en paralelo, no bloquea C1–C4).

**DoD:** página pública accesible sin login, enlazada desde vitrina. Cero cambios de BD.

## C1 — BD: definición + snapshot + preview (**b047**) — ✅ COMPLETA + hard-testeada (2026-08-04)

> Aplicada como `ketzal_cancellation_policy` + `_fix_guard` (espejo consolidado `db/proposed/b047_cancellation_policy.sql`). Hard-test en vivo con fixtures QA (limpiadas): cascada default/override, snapshot idempotente y **congelado** (override 99% no mueve la venta ni el doc público), cross-agencia denegado, comprador acepta su pedido / no el ajeno, anon por token fail-closed, tramos 10/50/no-show + piso enganche, RLS de preview. Invariantes 0, advisors **0 ERROR**. **Bug real cachado por el hard-test:** el guard de dueño con OR trivalente (`marketplace_customer_id` null ⇒ NULL ⇒ no raise) — corregido con `coalesce(..., false)`.

**Objetivo:** la política vive en datos, se congela por venta y se puede calcular la pena.

**BD (migración `b047_cancellation_policy`):**
- Definición en cascada, sin tabla nueva:
  - Default plataforma: `app_settings.cancellation_policy` jsonb (la tabla ya existe — logo, wa gate).
  - Override por agencia: `suppliers.info.cancellation_policy` (jsonb existente, patrón CLABE SPEI de b034 — **sin DDL**).
  - Override por servicio: **diferido** (YAGNI hasta que una agencia lo pida).
  - Shape: `{tramos:[{dias_min:30,retencion_pct:10},{dias_min:15,retencion_pct:25},{dias_min:7,retencion_pct:50},{dias_min:2,retencion_pct:75}], no_show_pct:100, piso_enganche:true, credito:{pct:100, vigencia_meses:12}, cambio_fecha:{gratis_primero:true, aviso_min_dias:20}, aviso_min_pax_dias:7, atraso_max_dias:15, version:1}`.
  - Fórmula de pena (vive en los RPCs): `pena = max(tramo_pct × total, enganche_pactado)` con tope el total; `a_devolver = max(0, pagado − pena)`.
- `bookings` + 3 columnas nullable (ventas viejas quedan null = "sin política pactada", se maneja en UI):
  - `cancellation_policy` jsonb (snapshot),
  - `policy_accepted_at timestamptz`,
  - `policy_accepted_meta` jsonb (canal: checkout|cotizacion|agente, ip, user_agent).
- RPCs nuevos (todos con `search_path` fijo, REVOKE public/anon salvo el de token):
  - **`snapshot_booking_policy(p_booking)`** INVOKER: resuelve agencia→default y copia al booking **solo si aún no tiene** (idempotente). Se llama desde los actions tras crear venta/pedido — así NO se toca `create_booking_with_items`.
  - **`accept_booking_policy(p_booking, p_meta)`** INVOKER: sella `policy_accepted_at` (solo si null; visibilidad = RLS de la venta / dueño del pedido).
  - **`accept_policy_by_token(p_token, p_meta)`** DEFINER **anon** fail-closed: resuelve por el token de la cotización (misma visibilidad que `get_quote_by_token`), sella solo si null. Escritura mínima y de un solo sentido — es lo único que anon puede "escribir".
  - **`preview_cancellation(p_booking)`** INVOKER, solo lectura: días a `travel_date`, tramo aplicable, `pena_mxn`, `pagado_mxn`, y **las dos salidas** — `efectivo: {a_devolver}` (= max(0, pagado − pena)) y `credito: {monto: pagado, expira: hoy+12m}` — más flags (sin política, sin aceptación, ya cancelada).
- **`get_public_doc_policy(p_kind, p_id)`** DEFINER anon `LANGUAGE sql` (patrón `get_public_doc_currency`): regresa el snapshot + accepted_at para cotización/estado públicos, sin re-aplicar los RPCs hermanos.

**Hard-test (rollback, agencias QA):** cascada agencia>default; snapshot idempotente; accept 2ª vez no-op; accept por token de otra venta falla; preview en cada tramo + no-show + venta sin política; RLS entre agencias.

**DoD:** advisors 0 ERROR; espejo `db/proposed/b047_cancellation_policy.sql`; sin tocar RPCs compartidos.

## C2 — Aceptación visible en los dos carriles

**Objetivo:** ninguna venta nueva nace sin política pactada.

- **Marketplace (`/comprar/[serviceId]`):** checkbox obligatorio "Leí y acepto la [política de cancelación]" en el form del pedido; el action llama `snapshot_booking_policy` + `accept_booking_policy` (meta: canal=checkout, ip del header). Nota LFPC art. 56: operativamente, compra online cancelada ≤5 días hábiles y con viaje lejano ⇒ devolver 100% sin pelear (regla de texto en la política, no de código).
- **Cotización pública (`/cotizacion/[token]`):** bloque "Política de cancelación" (vía `get_public_doc_policy`) + botón "Acepto la política" (`accept_policy_by_token`). La cotización sigue funcionando sin aceptar — pero la venta muestra el hueco.
- **OS (`/ventas/nueva` + `/ventas/[id]`):** el action de crear venta llama `snapshot_booking_policy`; el detalle muestra badge **"Política aceptada el X vía Y"** o **"⚠️ Sin aceptación registrada"** (con acción "registrar aceptación verbal/WhatsApp" → `accept_booking_policy` meta canal=agente — sirve para ventas telefónicas, deja rastro de quién la registró).
- Edición localizada solamente: `comprar/actions.ts`, `cotizacion/[token]/page.tsx`, `ventas/nueva` action, `ventas/[id]/page.tsx` (+ componente nuevo `politica-badge.tsx`).

**DoD:** venta/pedido nuevos siempre con snapshot; aceptación visible en detalle; `tsc`+`build` limpios.

## C3 — Reembolso parcial (**b048**)

**Objetivo:** poder devolver "lo que toca" según el tramo (hoy solo existe reembolso total por pago).

**BD (`b048_refund_partial`):**
- RPC **`refund_partial(p_booking, p_amount, p_reason)`** INVOKER: asiento `refund` por monto arbitrario con guards calco de `refund_payment` (monto > 0, ≤ pagado neto COMPLETED, venta visible por RLS, cuenta activa); `reason` va en el asiento (columna nueva `payments.note` text nullable — o reusar si ya existe algo). No liga a un pago específico (`refunds_payment_id` null): es reembolso a nivel venta.
- `refund_payment` (total, ligado) queda intacto — siguen coexistiendo.
- **MP parcial:** la API de refunds de MP acepta `{amount}` — action nueva **`reembolsarParcialMP`** espejo de `reembolsarPago` (orden MP→ledger, idempotency key, reporte de reconciliación manual si el ledger falla tras refund OK). SPEI/efectivo: devolución física a mano + asiento (como hoy).

**App:** en `/ventas/[id]`, sección de abonos gana "Reembolso parcial" (admin): monto + motivo, con el saldo neto visible.

**Hard-test:** parcial ≤ pagado ok; excedente bloqueado; dos parciales acumulan; interacción con `bookings_with_balance` (saldo revive); invariantes existentes en 0.

**DoD:** advisors 0 ERROR; espejo b048; `verificar_invariantes` NO tocado (el check "Σrefunds ≤ Σpayments" ya lo cubre el guard; si el carril backend quiere el check formal, va como función/entrada aparte).

## C4 — Cancelar con política (**b049**)

**Objetivo:** el flujo de cancelar deja de ser "status + motivo" y pasa a "pena calculada + evidencia + reembolso sugerido".

**BD (`b049_cancel_with_policy`):**
- `bookings` + `cancel_fee_mxn numeric` + `cancelled_at timestamptz` (nullable).
- RPC **`cancel_booking_v2(p_booking, p_reason, p_mode, p_waive_fee bool default false)`** INVOKER, `p_mode in ('efectivo','credito')`:
  - calcula la pena con la misma lógica de `preview_cancellation` (tramo a la fecha de HOY, piso enganche);
  - `p_mode='credito'` ⇒ pena 0 y emite el crédito de C5 **en la misma transacción** (asiento `refund` método `credito` + fila en `credits`) — no puede quedar cancelada-sin-crédito;
  - `p_waive_fee=true` (cancelación imputable a la agencia / fuerza mayor / mínimo de pax) ⇒ pena 0, motivo obligatorio;
  - sella `status='cancelled'`, `cancel_reason`, `cancel_fee_mxn`, `cancelled_at`;
  - en modo efectivo **NO reembolsa automático** — devolver es acto separado y consciente (`refund_partial`), el RPC solo deja el número.
- `cancel_booking` v1 queda para compat (o la UI deja de llamarlo; no se borra).

**App (`/ventas/[id]`):** `cancelar-venta.tsx` evoluciona: al abrir muestra el preview con **las dos opciones lado a lado** — "Crédito $pagado (vence en 12 meses)" vs "Efectivo: devolver $X (pena $Y)" — con el crédito como opción destacada; toggle "condonar pena (cancelación de la agencia)" con motivo obligatorio; tras cancelar en efectivo, botón "Reembolsar $X" prellenado hacia el flujo C3. Ventas sin política/aceptación: aviso "sin política pactada — pena manual" (input libre).

**Hard-test:** cancelar en cada tramo asigna la pena correcta (con piso enganche); modo crédito ⇒ pena 0 + crédito emitido atómico; waive ⇒ 0; venta sin política ⇒ pena null y no truena; cancelada no re-cancela; cupo se libera (trigger existente); reembolso posterior cuadra con `a_devolver`.

**DoD:** advisors 0 ERROR; espejo b049; flujo completo cancelar→reembolsar en una venta QA end-to-end.

## C5 — Crédito (saldo a favor) (**b050**)

**Objetivo:** el "crédito antes que devolución" existe como objeto de primera clase: se emite al cancelar, se canjea como abono en una venta nueva, expira solo.

**Diseño ledger (coherente con las reglas de oro):**
- **Emisión** (desde `cancel_booking_v2` modo crédito): asiento `refund` método `credito` por lo pagado en la venta cancelada (la venta queda saldada sin salida de efectivo) + fila en **`ketzal.credits`** (`id`, `supplier_id` (agencia vendedora), `customer_id`, `booking_origen_id`, `amount_mxn`, `expires_at` (= emisión + vigencia_meses del snapshot), `note`, `created_by`). RLS = visibilidad por agencia (calco payments); escritura solo vía RPC.
- **Saldo del crédito DERIVADO** (regla de oro #2): `amount_mxn − Σ(canjes COMPLETED)`. Sin campo mutable.
- **Canje**: RPC **`redeem_credit(p_credit, p_booking, p_amount)`** INVOKER — guards: mismo customer y misma agencia vendedora, no expirado (`now() < expires_at`, chequeo lazy — no hay cron de expiración), `p_amount ≤ saldo del crédito` y `≤ saldo de la venta destino`; inserta asiento `payment` método `credito` con **`payments.credit_id`** (columna nueva nullable, única DDL sobre payments). Remanente persiste solo (saldo derivado).
- **No canjeable por efectivo**: `refund_partial`/`refund_payment` rechazan asientos método `credito` como base de reembolso en efectivo.

**App:**
- `/ventas/[id]` (venta nueva): en abonos, opción "Aplicar crédito" si el cliente tiene créditos vigentes con saldo (lista + monto).
- Ficha del cliente: badge "Crédito disponible $X (vence dd/mm)".
- `(travel)/mis-compras`: el viajero ve su crédito vigente (RPC DEFINER scoped al dueño, patrón `list_my_marketplace_orders` — key nueva en RPC NUEVO, sin re-apply).

**Hard-test:** cancelar-con-crédito → canje parcial en venta nueva → remanente correcto; canje sobre saldo bloqueado; expirado bloqueado; cross-customer y cross-agencia bloqueados; doble canje race-safe; reembolsar en efectivo un abono método crédito bloqueado; invariantes 0.

**DoD:** advisors 0 ERROR; espejo b050; el ciclo completo cancelar→crédito→canje probado end-to-end en QA.

---

## Diferido a propósito (no construir hasta que duela)

- **Política por servicio** (override fino).
- **Reparto de la pena en reventas** (owner/selling) + ajuste en `payables_summary` — necesita decisión §8 y toca CxP de F2: carril backend.
- **Cancelación de salida completa** (mínimo de pax): herramienta que cancele en lote con waive + notifique — hoy se hace venta por venta.
- **Reporte "penas retenidas"** en `/reportes`.
- **Checks nuevos en `verificar_invariantes`** (`pena > total`, `refund_neto > pagado`): solo cuando el carril backend re-aplique la función por otra razón.

## Coordinación multi-agente

- Este carril (`cancelaciones`) es dueño de: docs, página pública C0, componentes nuevos (`politica-badge`, preview de cancelación), y las ediciones localizadas listadas en C2/C4.
- **BD/RPCs (b047–b050)**: el fundador decidió (2026-08-04) que este carril los construye, con el protocolo completo (aplicar → espejo → hard-test rollback → advisors).
- Archivos compartidos que se tocan (edición mínima, rebase-friendly): `ventas/[id]/page.tsx`, `ventas/[id]/cancelar-venta.tsx`, `ventas/nueva` action, `comprar/actions.ts`, `cotizacion/[token]/page.tsx`, `proxy.ts` (1 línea), footer público.
- Si alguien re-aplica `get_quote_by_token`/`list_my_marketplace_orders`: no hay colisión (la política viaja por `get_public_doc_policy`), pero conservar sus keys existentes como siempre.

## Orden y tamaño

C0 (chico, texto ya decidido) → C1 (el corazón, 1 migración) → C2 (UI, sin BD) → C3 (1 migración) → C4+C5 (2 migraciones; C4 depende de C5 para el modo crédito — pueden ir juntas en un solo carril). C2 puede ir en paralelo con C3. Cada fase es integrable por separado vía `/integrar-pr`.
