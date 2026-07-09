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

## Fuera de alcance hasta que se decida explícitamente
- Facturación fiscal (CFDI/SAT con PAC) — proyecto propio
- App móvil nativa
- Expansión geográfica fuera de Chihuahua (primero dominar una plaza)
