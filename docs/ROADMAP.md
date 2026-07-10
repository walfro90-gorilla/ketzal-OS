# Roadmap — Ketzal

Principio: **cada fase se sostiene sola y siembra la siguiente.** Si el proyecto se detuviera en v1.5, seguiría siendo un negocio rentable.

---

## v1 · Ketzal OS — núcleo  ← FOCO ACTUAL
Back-office multi-agencia. Un agente cierra la venta de un tour, controla abonos y emite recibo.

- Agencias, agentes (roles), clientes
- Catálogo de servicios (reusar `services`)
- **Venta con líneas** (precio con opciones), estados de venta
- **Abonos** como ledger (efectivo/transferencia/tarjeta registrada)
- **Recibos** con folio secuencial por agencia
- Multi-tenancy con RLS por agencia
- Campos de comisión (`owner_agency_id`, `selling_agency_id`) presentes, sin cálculo

**Desbloquea:** caja y control operativo desde el primer día; datos reales de oferta y transacciones.

---

## v1.5 · Cotizador y comisiones
- **Cotizador**: cotización enviable (WhatsApp/PDF) que se convierte en venta
- **Cancelaciones y reembolsos** (asientos negativos en el ledger)
- **Tablero**: saldos, vencimientos de abonos, ventas por agente
- **Cálculo de comisión** inter-agencia (revender Border/Snapshot)

**Desbloquea:** vender más rápido y comisionar formalmente entre las agencias.

---

## v2 · Catálogo público
- Servicios de las 3 agencias visibles al público (Next SSR + SEO)
- "Pedir informes" y captura de leads → entran a `customers`

**Desbloquea:** demanda entrante; dejar de depender solo de WhatsApp.

---

## v3 · Reserva y pago en línea
- Auto-registro del cliente (ahora sí, `auth.users` + `profiles` de tipo viajero)
- Reserva self-service
- **Pago en línea** con Stripe Connect / Mercado Pago (escrow, idempotencia)
- Reseñas

**Desbloquea:** el marketplace transaccional de verdad.

---

## v4 · Capa social e influencers (el sueño 🅰️)
- Planners públicos, unirse a viajes de otros (`travel_planners`, `share_code`)
- Afiliación de influencers (comisión por viajero que traen)
- Gamificación: monedas Axo, wallet, wishlists
- Se **encienden las tablas dormidas** del schema

**Desbloquea:** la red social de viajes — ya con oferta, datos y proveedores reales, sin arranque en frío.

---

## Pagos en línea — estado real y ruta futura (nota viva, 2026-07-10)

**Hoy (ya en prod):** Mercado Pago Checkout Pro **validado en producción** (SPEI real confirmado end-to-end). El agente cobra saldo o abono; el webhook confirma contra la API de MP y el ledger registra el abono. Idempotente.

**Campo ya preparado para multi-PSP:** `payment_intents.provider` es `text NOT NULL default 'mercadopago'`. Sumar otro proveedor **no requiere cambio de schema** — solo poblar `provider` distinto.

**Ruta futura — Openpay (cuando el volumen lo justifique):** Openpay es **de BBVA**; genera CLABE + referencia para cobro **SPEI**, tiene **webhooks** y **liquida a la cuenta BBVA**, evitando el ~3.5% de tarjeta de MP. Pasos para implementarlo (sin tocar schema):
1. Credenciales Openpay (env vars) + comparar su tarifa SPEI-in vs MP.
2. Acción `crearCargoSpeiOpenpay` que cree el cargo SPEI y guarde el intento con `provider='openpay'`.
3. Ruta `/api/openpay/webhook` que confirme con el **mismo** RPC `confirm_online_payment` (correlaciona por `external_reference`).

**Por lo pronto: SOLO MP.** No se construye scaffolding de Openpay hasta decidir hacerlo (YAGNI).

---

## Fuera de alcance hasta que se decida explícitamente
- Facturación fiscal (CFDI/SAT con PAC) — proyecto propio
- App móvil nativa
- Expansión geográfica fuera de Chihuahua (primero dominar una plaza)
