# Modelo de datos — Ketzal OS (v1)

Schema: **`ketzal`** en Supabase Gorilla-Labs. Evolucionamos el schema existente; no creamos uno nuevo.
**Estado: APLICADO** (migraciones `ketzal_os_v1_sales_core` + `ketzal_os_v1_security_hardening`, 2026-07-08). DDL de referencia en `../db/proposed/001_ketzal_os_v1.sql`.

## Tenancy — la agencia es un `supplier`

Decisión reconciliada al inspeccionar la BD: **no hay tabla `agencies`**. Las agencias (Wanderlust, Border, Snapshot) son filas en **`suppliers`** con `supplier_type = 'agency'`. Los proveedores operativos (transporte, hotel) también son `suppliers`, de otro tipo. Se reutiliza:
- `profiles.supplier_id` → la agencia del agente.
- `ketzal.my_supplier_id()` y `ketzal.is_superadmin()` → helpers de RLS (ya existían).
- `services.supplier_id` → la agencia dueña del servicio.

## Leyenda

- 🟢 **nueva** — creada en v1
- 🔵 **reusada** — ya existía, se usa tal cual
- 🟠 **ampliada** — existía, ganó columnas en v1
- ⚪ **dormida** — del marketplace B2C, vacía hasta fase 4

## Entidades

### 🔵 `suppliers` — agencias + proveedores operativos (tenant)
Ya existe. Las **agencias** son `supplier_type='agency'` (los tenants vendedores). Transporte/hotel son otros tipos, insumos de un servicio. Campos: `name`, `contact_email`, `supplier_type`, `supplier_sub_type`, `location` (jsonb), `photos`, `info`…

### 🔵 `profiles` — usuarios del sistema (agentes / admins)
Ya existe (`id` → `auth.users`, `role user_role`, `supplier_id`, `name`, `email`…). `supplier_id` liga al agente con su agencia. `role` = `user | admin | superadmin` (vendedores usan `admin` en v1). Campos de gamificación (`axo_coins_earned`, wallet) dormidos.

### 🟢 `customers` — clientes de la agencia
**Clave:** NO son `auth.users`. El agente los captura (lead de WhatsApp, mostrador). Sin login.

| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| supplier_id | uuid fk → suppliers | la agencia (RLS) |
| full_name | text not null | |
| phone, email, doc_id, notes | text | |
| created_by | uuid fk → profiles | agente que lo dio de alta |
| created_at, updated_at | timestamptz | trigger `touch_updated_at` |

### 🟠 `bookings` — LA VENTA (centro de gravedad)

| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| folio | text | código humano de la venta |
| selling_supplier_id | uuid fk → suppliers | quién vendió (**RLS principal**) |
| owner_supplier_id | uuid fk → suppliers | de quién es el servicio (= selling si es propio) |
| customer_id | uuid fk → customers | |
| service_id | uuid fk → services | **nullable** (venta a medida) |
| sold_by | uuid fk → profiles | el agente |
| travel_date | date | |
| num_pax | int | denormalizado |
| subtotal, discount, total | numeric(12,2) | `total = subtotal − discount` |
| currency | text | default `'MXN'` |
| status | `ketzal.booking_status` | `draft→reserved→confirmed→paid` · `cancelled` |
| notes | text | |
| created_at, updated_at | timestamptz | |

### 🟢 `booking_items` — líneas de la venta (precio con opciones)

| columna | tipo | notas |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid fk → bookings | `on delete cascade` |
| item_type | text | `passenger \| room \| addon \| custom` |
| passenger_type | text | `adult \| child \| inapam` |
| description | text | soporta la línea manual |
| qty | int | |
| unit_price | numeric(12,2) | **editable a mano** (válvula de escape) |
| line_total | numeric(12,2) | `qty * unit_price` |
| meta | jsonb | detalle de la opción |

### 🟠 `payments` — abonos (ledger)
Ya existía. **Ampliada** con `booking_id`, `supplier_id`, `type` (`ketzal.payment_type` = `payment \| refund`). Cada fila = un abono real (o un reembolso). El estado usa el enum existente `payment_status` (`PENDING \| PARTIAL \| COMPLETED \| REFUNDED`). Los viejos `installments`/`current_installment` quedan dormidos.
`user_id` (NOT NULL → auth.users) se llena con **el agente que registra el abono** (el cliente no tiene login).

### 🟢 `receipts` + `receipt_counters` — recibos con folio atómico

`receipts`: `id`, `supplier_id`, `booking_id`, `payment_id` (nullable), `folio bigint`, `amount`, `issued_by`, `issued_at`, `pdf_url`. Único por `(supplier_id, folio)`.
`receipt_counters`: `(supplier_id pk, last_folio)` — RLS activo **sin política** (nadie lo toca por API). El folio se obtiene con `ketzal.next_receipt_folio(supplier)` (`SECURITY DEFINER`, lock de fila, sin huecos).

### 🔵 `services` — catálogo de tours (reusada, excelente)
32 columnas: origen/destino, `packs`, `add_ons`, `seasonal_prices`, `itinerary`, `dates`, `current_bookings`, `max_capacity`, `transport_provider_id`, `hotel_provider_id`. `supplier_id` = agencia dueña.

### ⚪ Dormidas (fase 4)
`wallets`, `wallet_transactions`, `wishlists`, `wishlist_items`, `travel_planners`, `planner_items`, `reviews`, `notifications`, `products`, `categories`.

## Relaciones

```
suppliers(type='agency') 1─N profiles      (supplier_id)
suppliers(type='agency') 1─N customers      (supplier_id)
suppliers(type='agency') 1─N services       (supplier_id)
customers 1─N bookings                      (customer_id)
profiles  1─N bookings                      (sold_by)
services  1─N bookings                      (service_id, nullable)
bookings  1─N booking_items                 (booking_id, cascade)
bookings  1─N payments                      (booking_id)
bookings  1─N receipts                      (booking_id)
payments  1─1 receipts                      (payment_id, opcional)

owner_supplier_id ≠ selling_supplier_id  ⇒  reventa → comisión inter-agencia (cálculo en v1.5)
```

## Derivaciones y garantías

- **Saldo:** vista `ketzal.bookings_with_balance` (con `security_invoker=true`) = `total − Σ(payments type=payment COMPLETED) + Σ(refund)`.
- **Estado `paid`:** cuando el saldo llega a 0 (lógica en capa de dominio).
- **Folio:** `ketzal.next_receipt_folio(supplier_id)`, atómico y sin huecos por agencia.
- **Cupo:** al pasar a `confirmed`, incrementar `services.current_bookings` en la misma transacción, validar `<= max_capacity`.
- **RLS:** `supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin()` en toda tabla operativa; en `bookings` por `selling_supplier_id`; `booking_items` hereda del booking.

## Pendiente inmediato (semilla)

Convertir Wanderlust/Border/Snapshot en filas de `suppliers` (`supplier_type='agency'`) y ligar `profiles.supplier_id` del/los usuarios. Sin esto, el RLS no deja ver nada.
