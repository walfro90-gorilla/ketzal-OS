# Terreno del Marketplace (Fase B)

> Plan acordado con el fundador. La Fase B abre el camino B2C (🅰️) sobre el
> catálogo público que ya existe, **sin** romper el alcance del OS (🅱️).
> Cada paso es reversible y verificable.

## Objetivo

Que un visitante del catálogo público que quiera **comprar en línea** pueda
**crear una cuenta rápido** y **adquirir el servicio**, sin depender de WhatsApp.

## Decisiones (confirmadas)

1. **Identidad del comprador** — tabla nueva **`ketzal.marketplace_customers`**
   (uid de Supabase Auth → nombre/teléfono/email), **aislada** de `profiles`
   (agentes). Auto-registro, sin aprobación. No toca la RLS por agencia.
2. **Lanzamiento oscuro** — feature flag `NEXT_PUBLIC_MARKETPLACE` (`off` por
   default). El CTA y las rutas nuevas quedan invisibles hasta prenderlo.
3. **Pago** — reusar **MP Checkout Pro** (ya validado en prod); Openpay después.

## Pasos

### B.0 — Terreno mínimo ✅ APLICADO

Abre el camino y la cuenta de comprador, **sin tocar dinero**:

- Flag `NEXT_PUBLIC_MARKETPLACE` (`src/lib/marketplace.ts`), off por default.
- Tabla `marketplace_customers` + RLS **solo-dueño** (`id = auth.uid()`), aislada
  de `profiles`. Migración `ketzal_marketplace_customers`; snapshot re-sincronizado.
- Registro de comprador (`/comprar/actions.ts`): `signUp` con **email+password**
  (NO magic link/OAuth, para no pasar por `/auth/callback` → el comprador nunca
  nace como agente en `profiles`). La fila se crea con service role (idempotente).
- Ruta `/comprar/[serviceId]` (detrás del flag): sin sesión → alta rápida; con
  cuenta → resumen del viaje + **handoff a WhatsApp** para coordinar la compra
  (el pago en línea llega en B.2).
- CTA **"Comprar en línea"** en la ficha (`/servicio/[id]`), detrás del flag,
  como acción primaria; WhatsApp pasa a secundaria.

**Aislación verificada:** `ensure_profile` solo corre en `/auth/callback`; el
comprador (email+password) no lo dispara. `marketplace_customers` no tiene policy
de agente/superadmin. Advisors: 0 errores.

**Hard testing B.0 (2026-07-20):**
- **Grants** — la migración concede `SELECT/INSERT/UPDATE` solo a `authenticated`
  (sin `PUBLIC`/`anon`) ⇒ un anónimo no lee ni escribe la tabla.
- **Policies** — las 3 son `id = auth.uid()` (SELECT/INSERT/UPDATE); ninguna
  referencia helpers de agente ⇒ un comprador solo ve/edita su fila; un agente
  no ve filas de compradores.
- **No-forge** — `registrarComprador` inserta con el `id` que devuelve `signUp`
  (no forjable); `guardarComprador` va por RLS (`id = auth.uid()`); el `INSERT`
  con check `id = auth.uid()` bloquea crear la fila de otro por PostgREST.
- **Escalada** — aun si el caso email-confirm creara un `profiles`, nace
  `active=false` sin `supplier_id` ⇒ cero acceso al lado de agentes
  (`is_active()` lo corta). Cierre en B.1-0.
- **Inyección** — las acciones usan el cliente Supabase parametrizado (sin SQL
  por concatenación).
- *Pendiente por tooling:* la simulación viva de RLS entre dos compradores
  (`set role` + jwt claims) no se pudo correr por abortos del MCP en esta
  sesión; la aislación se sostiene en la estructura de arriba. Repetir en B.1
  con `set local request.jwt.claims` cuando el tooling coopere.

### B.1 — Pedido de marketplace + endurecer confirmación (pendiente)

> **Se continúa en Claude console** (esta sesión sigue con UI/UX).

**B.1-0 ✅ APLICADO (2026-07-20) — `ensure_profile` buyer-aware.**
Se cerró por la opción (c): un guard en la **función compartida** en vez de una
ruta nueva + config de dashboard. Cierra el hoyo por **todos** los caminos a
`ensure_profile`, no solo el link de correo. Migración `ensure_profile_buyer_aware`:
```sql
where u.id = auth.uid()
  and not exists (select 1 from ketzal.marketplace_customers m where m.id = auth.uid())
```
Así, aunque el link de confirmación caiga en `/auth/callback`, un comprador
(fila en `marketplace_customers`) **nunca** nace como `profiles`/agente pendiente.
Verificado: self-check del predicado (no-comprador→inserta, comprador→salta) OK;
advisors de seguridad **0 errores**. Migración no versionada en repo (Supabase es
la fuente, per convención). Descartadas (a) ruta `/comprar/confirmado` y (b)
Redirect URLs por más diff y menos cobertura.

**B.1-1 ✅ APLICADO (2026-07-20) — pedido de marketplace.**
- Migración `bookings_marketplace_customer_id`: columna nullable
  `bookings.marketplace_customer_id` (FK → `marketplace_customers`). Liga el
  pedido al comprador **y** marca origen-marketplace para la bandeja de B.3.
- Migración `get_public_service_departures`: la ficha pública ahora expone
  `departures` (salidas futuras con cupo libre) para el selector de fecha.
- Migración `create_marketplace_order(p_service_id, p_travel_date, p_items)`
  (RPC SECURITY DEFINER, `grant execute` solo a `authenticated`): valida
  comprador ∈ `marketplace_customers`, servicio `published` (fail-closed),
  **precio autoritativo desde `services.packs`** (no confía en el cliente),
  **cupo bloqueante sin decrementar** (si hay `service_departures`), espeja una
  fila en `customers` bajo la agencia dueña (`created_by=null` porque el uid del
  comprador no está en `profiles`), e inserta el booking **`status='draft'`** +
  líneas de pasajero. `draft` ⇒ el trigger de capacidad **no consume cupo**
  todavía (eso es B.2, al pasar a `reserved`). `selling = owner = services.supplier_id`.
- Frontend: `/comprar/[serviceId]` con sesión+ficha completa muestra `PedidoForm`
  (selector de packs + fecha de salida si aplica) → crea el pedido → confirmación
  + handoff WhatsApp para coordinar el pago.
- Verificado: self-test del RPC (caso feliz total/status/pax/espejo + negativos
  pack-inválido/servicio-inexistente), revertido sin dejar datos; `tsc --noEmit`
  y `eslint` limpios.
- **Simplificaciones deliberadas:** cada pedido crea una fila `customers` nueva
  (sin dedup por comprador) y los pedidos `draft` aparecen en las listas de la
  agencia mezclados con ventas de agente hasta que B.3 agregue la bandeja.

### B.2 — Pago en línea

**B.2a ✅ APLICADO (2026-07-20) — contado (pago total).** Reusa toda la infra MP
del agente (webhook, preferencia Checkout Pro, `mp-signature`), sin tocarla.
- Migración `payment_intents_marketplace_customer_id`: columna nueva (el comprador
  no está en `profiles`; `created_by` va null, se liga por `marketplace_customer_id`).
- RPC `create_marketplace_payment_intent(booking_id, amount=null)` → `{id, amount}`
  (SECURITY DEFINER, solo `authenticated`): valida que el pedido sea del comprador,
  monto = saldo (contado) o `p_amount` (B.2b), **decidido server-side** (la
  preferencia MP cobra ese monto, no el del cliente).
- Parche `confirm_online_payment` (solo afecta pedidos `draft`; agente intacto):
  `payments.user_id = coalesce(created_by, marketplace_customer_id)`; el pedido
  `draft` **toma asiento** (`draft→reserved`, dispara el trigger de cupo) antes de
  `→paid`; **carrera de cupo** → subtransacción conserva el pago + log
  `pagado_sin_cupo` (resolución manual), el pedido se queda `draft` pagado.
- Frontend: botón "Pagar en línea" en el pedido → RPC intent → preferencia MP →
  redirect. El webhook confirma (abono al ledger, cupo, `paid`).
- Verificado: self-test end-to-end (contado→paid+idempotente · cupo 0→2 al pagar
  no al pedir · carrera→pago registrado+draft+log), revertido; `tsc`+`eslint` limpios.

**B.2b ✅ APLICADO (2026-07-20) — enganche + abonos.** Encima de B.2a.
- RPC `generate_marketplace_payment_plan(booking, frequency, final_date)` (SECURITY
  DEFINER, valida dueño-comprador): espeja `generate_payment_plan` reusando el core
  `_compute_payment_plan` + `payment_schedule` + `bookings.payment_type='abonos'`.
  Fecha límite = la salida si hay (`booking.travel_date`), si no la que elige el
  comprador. Enganche fijo **20%**.
- `create_marketplace_payment_intent` acepta `p_amount` (el enganche); el frontend
  paga el enganche → `confirm_online_payment` registra el abono parcial, toma cupo
  (`draft→reserved`) y **deja `reserved`** hasta saldar (no pasa a `paid`).
- Frontend: `PagoBloque` (contado / en abonos): frecuencia (semanal/quincenal/
  mensual) + fecha límite (si no hay salida) → preview (`preview_payment_plan`) →
  "Pagar enganche". `WaButton` extraído a componente compartido.
- Verificado: self-test (plan enganche=20%, suma schedule = total invariante,
  payment_type='abonos'; enganche pagado → reserved + saldo restante + cupo), revertido.

**Abonos siguientes (pagar el 2º, 3º…):** requieren "Mis compras" ⇒ **B.3**.

**Comisión de plataforma:** diferida (campos `owner/selling_supplier_id` listos;
`commissions_summary` es derivado). Hoy `selling = owner = agencia` ⇒ sin comisión
de plataforma capturada; se calcula cuando se decida el modelo.

### B.3 — Post-venta ✅ APLICADO (2026-07-20)

- **Dedup de customers**: `customers.marketplace_customer_id` (+ índice único por
  supplier+comprador) y `create_marketplace_order` ahora hace find-or-create —
  un comprador que pide varias veces a la misma agencia reusa su fila de cliente.
- **RPC `list_my_marketplace_orders`** (SECURITY DEFINER; el comprador no tiene
  RLS sobre bookings): sus pedidos con saldo, **próximo abono** (siguiente cuota
  del `payment_schedule` no cubierta por lo pagado) y elegibilidad/estado de reseña.
- **`/mis-compras`** (comprador, tras flag): lista + "Pagar siguiente abono" /
  "Liquidar" (reusa `crearLinkPagoMarketplace`) + **formulario de calificación**
  del viaje (proveedor + app) para viajes completados. Link desde `/comprar`.
- **Lado agencia**: badge "Marketplace" + **"Calificar al viajero"** en el detalle
  de venta `/ventas/[id]` (RPC `submit_rating`, cierra la 3ª dirección).
- Verificado: self-test (dedup=1 customer, lista, próximo abono correcto) + `tsc`
  + `eslint`.
- **Pendiente menor**: filtro/badge "Marketplace" en la *lista* `/ventas` (hoy el
  badge está en el detalle); backend ya lo soporta (`marketplace_customer_id`).

### Calificaciones post-viaje (🅰️ social — terreno dormido tras flag)

Sistema polimórfico de 3 direcciones, atado a un booking completado (`paid` + fecha
pasada / sin fecha). Visibilidad **estilo Uber**.
- Tabla `ratings` (`booking_id, kind, author_id, rating 1-5, comment`, único por
  booking+kind+autor); sujeto derivado del booking. RLS: agencia ve sus reseñas +
  calificaciones de sus viajeros; superadmin todo; autor lo suyo.
- `kind`: `traveler_to_provider` (**pública**, ficha) · `traveler_to_app` (interna,
  superadmin) · `provider_to_traveler` (privada, agencias).
- RPC `submit_rating` (SECURITY DEFINER, valida autor por dirección + elegibilidad;
  fix de fails-open null-safe en el authz) + `get_service_reviews` (anon, ficha).
- **UI hecha:** reseñas públicas en la ficha `/servicio/[id]` (lectura), tras el flag.
- **UI pendiente:** formulario del viajero (proveedor + app) en "Mis compras" (B.3);
  agente califica al viajero en el detalle de venta. Backend ya listo para ambas.
- Verificado: self-test (3 direcciones, autor rechazado, elegibilidad, público,
  upsert), advisors 0 errores.

## Hard testing (adversarial, capa BD — 2026-07-20)

Baterías hostiles contra el schema real, en transacciones que revierten (cero
efecto en prod). Buscan romper RLS / dinero / cupo / calificaciones.

- **Batería 1 (14/14 ok):** anon, sobre-pago, monto negativo, escalada de
  comprador (pagar/calificar pedido ajeno), elegibilidad de reseña, rango de
  rating, dirección de rating, idempotencia del webhook, overbook al pedir,
  cupo ≤ max tras carrera, dedup, invariante suma-plan = total.
- **Batería 2A (6/6 ok):** RLS **directo a tabla** con rol `authenticated` real +
  jwt (cierra la simulación viva pendiente desde B.0): comprador no lee bookings
  (ni propios; van por RPC), no lee/escribe filas de otro tenant, no inserta
  rating directo, no fuerza `paid`, no spoofea comprador.
- **Batería 2B:** ledger append-only (delete pago/recibo bloqueado por `no_mutar`),
  inyección jsonb (qty float / pack inválido rechazados), plan adversarial
  (frecuencia inválida / fecha pasada) — **y 1 HALLAZGO REAL:**
  - **D1 doble-gasto (corregido):** dos `payment_intents` por el saldo completo se
    confirmaban ambos ⇒ saldo negativo (doble cobro). Fix en la función compartida
    `confirm_online_payment` (agente + marketplace): **guard anti-sobrepago** —
    recorta el pago al saldo restante y registra el excedente como evento
    `sobrepago` en `system_log` (reembolso manual; el dinero está en MP). El saldo
    nunca queda negativo. Verificado: fix + sin regresión (contado, enganche).
- **Batería 3 (4/4 ok):** ciclo de vida del cupo — el pago toma asiento, la
  cancelación lo repone, la doble-cancelación no lo repone dos veces (ni queda
  negativo), y cancelar un `draft` no toca el cupo.
- **Batería 4 — 1 HALLAZGO REAL (E5, corregido):** un webhook tardío confirmaba un
  pago contra un pedido ya **cancelado** ⇒ dinero registrado sin viaje y **sin
  flag**. Fix en `confirm_online_payment`: si el booking está `cancelled`, no se
  aplica el pago; se registra `pago_cancelado` en `system_log` para reembolso
  manual. Verificado + sin regresión (D1, contado, enganche). (E1 plan degenerado
  y E3 intent forjado: bloqueados ok.)
- **Batería 5 (3/3 ok):** RLS de `ratings` entre agencias — la agencia vendedora ve
  la calificación de su viajero, otra agencia NO la ve, y el viajero no ve su propia
  calificación (privada, Uber).
- **Batería 6 — 1 HALLAZGO REAL (F, corregido):** el fix D1 no era race-safe.
  `confirm_online_payment` bloqueaba solo la fila del *intent*, no la del *booking*;
  dos webhooks concurrentes de dos intents leían el saldo antes de insertar ⇒ doble
  cobro de nuevo. Fix: `select … from bookings … for update` al confirmar (patrón de
  `register_payment`), serializa confirmaciones del mismo pedido. Folio de recibo:
  atómico (`update … +1 returning`). Refund del agente: guarda `refund ≤ pagado`.
- **Batería 7:** dedup (índice único impide 2 customers) + regenerar plan (reemplaza
  limpio, suma=total) ok. Nit menor G3: `create_marketplace_order` permite `travel_date`
  en el pasado (no alcanzable por UI; hardening opcional: rechazar < hoy).
- **Batería 8 (4/4 ok):** rating en cancelado bloqueado, reviews de servicio inexistente
  vacío, lista de compras anon bloqueada, trigger de cupo revalida capacidad en el
  update (race-safe).
- **Loop-until-dry (2026-07-20):** 8 baterías, **3 bugs de dinero cazados y cerrados**
  (D1 doble-gasto secuencial, F doble-gasto concurrente, E5 pago-en-cancelado) — todos
  en la función compartida `confirm_online_payment` ⇒ protegen agente + marketplace.
  Resto (RLS directo/RPC/cross-agency, ledger append-only, folio, cupo, ratings, plan,
  inyección, anon, idempotencia, refund) aguantó. Superficie agotada.

## Reglas de oro que respeta

- **Aislamiento RLS:** comprador ≠ agente; la RLS por agencia no se toca.
- **Cupo transaccional** y **ledger append-only** (desde B.1/B.2).
- **Comisión** por reventa / plataforma con los campos ya existentes.
- **Sin sobre-ingeniería:** monolito Next + Supabase + MP; flag para lanzamiento
  oscuro.
