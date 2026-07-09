# Ketzal — Guía del proyecto

> Documento de contexto para cualquier sesión de desarrollo (humana o con Claude Code).
> Si vas a construir, **lee esto primero**, luego `docs/`.

## Qué es Ketzal

Visión de largo plazo: **"uberizar" los servicios turísticos** de Chihuahua → México → LATAM.
Una red social + marketplace donde viajeros, proveedores e influencers comparten y se unen a viajes.

**Pero no se construye así.** La estrategia acordada es en dos tiempos:

- 🅰️ **Ketzal Marketplace** (el sueño): red social B2C, planners públicos, reseñas, wallet, monedas "Axo", influencers. → **fases 3–4**.
- 🅱️ **Ketzal OS** (el foco actual): herramienta interna de ventas para las agencias del fundador. → **fase 1, lo que se construye ahora**.

**Tesis:** construir 🅱️ primero. Al operar las ventas reales de las agencias, Ketzal siembra la oferta, los proveedores y los datos que luego encienden 🅰️ **sin el arranque en frío** que mata a los marketplaces.

## Contexto de negocio

El fundador (Walfre) opera tres agencias reales:
- **Wanderlust Travels** — ecoturismo, fundada 2017 (Samalayuca, Creel, Casas Grandes/Paquimé, Trepachangas).
- **Border Travels** y **Snapshot** — agencias con viajes propios que se revenden **por comisión**.

Monetización hipótesis: **comisión por reserva** + **afiliación de influencers** (fase posterior).

## Alcance v1 (decidido — no expandir sin acuerdo explícito)

Back-office multi-agencia: un agente cierra la venta de un tour, controla abonos y emite recibo.

| Decisión | v1 |
|---|---|
| Wedge | **Venta + abonos + recibo** |
| Pagos | **Ledger** (registrar dinero), NO procesar en línea |
| Recibo | **Interno, no fiscal** (folio propio; CFDI/SAT es fase aparte) |
| Precio | **Con opciones** (tipos de pasajero + habitación/add-ons) ⇒ la venta lleva líneas |
| Comisión | Campos `owner_supplier_id` + `selling_supplier_id` **listos**, sin calcular aún |
| Base de datos | **Evolucionar** el schema `ketzal` existente (está vacío) |

> **Tenancy (reconciliado con la BD real):** las agencias NO son una tabla nueva. Son filas en **`suppliers`** con `supplier_type = 'agency'`. Se reutiliza `profiles.supplier_id` y las funciones existentes `ketzal.my_supplier_id()` e `ketzal.is_superadmin()` para el RLS. Los proveedores operativos (transporte, hotel) también son `suppliers`, de otro tipo.

**Fuera de v1 a propósito:** cobro en línea, factura fiscal, cálculo de comisiones, auto-registro de clientes, cualquier cosa social/gamificada.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** (Postgres 17, Auth, Storage, RLS) — proyecto **Gorilla-Labs** (`wnujoyzdpdyxblgdtxjw`), schema **`ketzal`**
- **shadcn/ui** + Tailwind
- Despliegue: Vercel

## Base de datos — estado actual

Schema `ketzal` ya existe con 14 tablas y RLS activo, pero **casi vacío** (2 services, 1 supplier). Es un scaffold del sueño 🅰️. Reutilizamos lo útil (`services`, `suppliers`, `payments`, `profiles`) y dejamos **dormidas** las tablas B2C (`wallets`, `wallet_transactions`, `wishlists`, `travel_planners`, etc.).
Detalle completo del modelo objetivo en **`docs/DATA_MODEL.md`**. SQL propuesto en **`db/proposed/`**.

## Reglas de oro (no negociables)

1. **RLS por `supplier_id` (la agencia) en todo.** Un agente jamás ve datos de otra agencia. Riesgo #1.
2. **Saldo derivado**, nunca campo mutable suelto: `total − Σ(pagos) + Σ(reembolsos)`.
3. **Ledger append-only**: cancelaciones/correcciones son asientos nuevos (`payment` tipo `refund`), no updates/deletes.
4. **Folio de recibo atómico**: secuencia por agencia, sin `count(*)+1`.
5. **Cupos transaccionales**: `current_bookings` vs `max_capacity` dentro de transacción.
6. **No sobre-ingeniería.** Monolito Next.js + Supabase. Nada de microservicios/Kafka/sharding.

## Estado

- [x] Estrategia, alcance y modelo de datos v1 definidos
- [x] Documentos base y SQL escritos
- [x] **Migración v1 APLICADA a `ketzal`** (2026-07-08): `ketzal_os_v1_sales_core` + `ketzal_os_v1_security_hardening`. Advisors de seguridad: **0 errores**.
- [ ] Semilla: crear Wanderlust/Border/Snapshot como `suppliers` type='agency' y ligar `profiles.supplier_id`
- [ ] Scaffolding de la app Next.js
- [ ] Primera pantalla: flujo del agente al cerrar una venta

## Docs

- `docs/ARCHITECTURE.md` — stack, principios, seguridad, qué NO hacer
- `docs/DATA_MODEL.md` — modelo de datos v1 completo
- `docs/ROADMAP.md` — fases v1 → v4
- `db/proposed/001_ketzal_os_v1.sql` — migración propuesta (revisar antes de aplicar)
