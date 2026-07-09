# Arquitectura — Ketzal OS (v1)

## Principio rector

> Tu riesgo no es la escala. Es que el saldo cuadre y los datos no se filtren.

Tres agencias hacen **cientos de ventas al mes, no millones**. Postgres/Supabase aguanta esto durante años sin esfuerzo. Toda la energía de arquitectura va a **correctitud** (el dinero) y **seguridad** (aislamiento entre agencias), no a infraestructura que no se necesita.

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Frontend / SSR | **Next.js (App Router) + TypeScript** | SSR para SEO (fase 2 catálogo público), un solo repo, DX conocido |
| UI | **shadcn/ui + Tailwind** | Componentes propios, sin lock-in, rápido |
| Datos / Auth / Storage | **Supabase (Postgres 17)** | Auth + RLS + realtime + storage en uno. RLS es el corazón de la seguridad |
| Hosting | **Vercel** | Integración directa con Next.js |
| Pagos (fase 3) | Stripe Connect / Mercado Pago Marketplace | Escrow; NO en v1 |

**Un monolito modular.** Sin microservicios, sin colas distribuidas, sin sharding, sin multi-región. Todo eso resuelve problemas de escala que —con suerte— tendremos en años; para entonces habrá dinero y equipo para atenderlos. Aburrido = estable.

## Multi-tenancy (lo más importante)

El sistema es **multi-agencia desde el día 1**. Wanderlust, Border y Snapshot comparten la misma base pero **jamás ven los datos del otro**.

**La agencia es un `supplier`** (con `supplier_type = 'agency'`), no una tabla aparte. Esto reutiliza la maquinaria de tenancy que el schema ya traía.

- `supplier_id` está presente en **toda** tabla operativa (customers, bookings, payments, receipts, services…).
- La pertenencia del usuario vive en `profiles.supplier_id` (ya existía).
- El aislamiento se aplica con **Row Level Security (RLS)** en Postgres, no en el código de la app. La app puede tener bugs; RLS es la última línea de defensa.

Helpers canónicos (ya existían en la BD, se reutilizan):

```sql
-- agencia (supplier) del usuario autenticado
ketzal.my_supplier_id() returns uuid
ketzal.is_superadmin()  returns boolean
-- política típica
using ( supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin() )
```

Rol **superadmin** (el fundador) ve todo vía el `or ketzal.is_superadmin()`. Los **agentes** quedan confinados a su agencia. `user_role` = `user | admin | superadmin` (los vendedores usan `admin` en v1; opcionalmente se agrega `agent`).

> Nota de comisiones: una venta lleva `owner_supplier_id` (dueño del servicio) y `selling_supplier_id` (quién vendió); si difieren, es una reventa de Border/Snapshot. En v1 la venta la ve la **agencia vendedora** (`selling_supplier_id`). La visibilidad cruzada para tableros de comisión se diseña en v1.5.

**Vistas y RLS:** las vistas que exponen datos por agencia (p. ej. `bookings_with_balance`) se crean con `security_invoker = true` para que respeten el RLS del que consulta. La función de folio es `SECURITY DEFINER` con `search_path` fijo.

## Integridad del dinero

Reglas que evitan que el ledger mienta:

1. **Saldo siempre derivado.** No existe columna `balance` editable. Se calcula:
   `saldo = booking.total − Σ(payments tipo pago) + Σ(payments tipo reembolso)`.
   Se expone con la vista `ketzal.bookings_with_balance`.
2. **Ledger append-only.** No se borran ni editan pagos. Una cancelación o corrección es un **asiento nuevo** (`payment` con `type = 'refund'`, monto positivo que resta). Historia intacta y auditable.
3. **Folio atómico.** El folio del recibo es una **secuencia por agencia**, generada con un `UPDATE ... RETURNING` sobre una fila-contador (lock de fila), nunca `count(*)+1` (que se rompe con dos agentes vendiendo a la vez).
4. **Cupos transaccionales.** Incrementar `services.current_bookings` y validar contra `max_capacity` ocurre dentro de la misma transacción que confirma la venta, para no sobrevender.
5. **Dinero en enteros o `numeric`.** Nunca `float`. Montos en `numeric(12,2)`; moneda explícita (`MXN` por defecto, `currency` preparado para USD en Border).

## Idempotencia

Relevante **solo desde la fase 3** (cobro en línea): cada intento de cobro lleva una `idempotency_key` para que un reintento de red no cobre dos veces. **No se implementa en v1** — hoy sería resolver un problema inexistente.

## Estructura de carpetas propuesta

```
ketzal-app/
├─ CLAUDE.md
├─ docs/                    # este directorio
├─ db/
│  ├─ proposed/             # SQL para revisión (aún no aplicado)
│  └─ migrations/           # migraciones aplicadas (Supabase)
├─ src/
│  ├─ app/                  # rutas Next.js (App Router)
│  │  ├─ (auth)/            # login del agente
│  │  └─ (ops)/             # back-office: clientes, ventas, abonos
│  ├─ components/           # UI (shadcn)
│  ├─ lib/
│  │  ├─ supabase/          # clientes server/browser
│  │  └─ domain/            # lógica de venta, saldos, folios
│  └─ types/                # tipos generados de Supabase
└─ ...
```

## Seguridad — checklist v1

- [ ] RLS activo en toda tabla nueva (ya lo está en las existentes)
- [ ] Política por `agency_id` + branch superadmin en cada tabla operativa
- [ ] `customers` no son `auth.users`: cero PII expuesta por API pública
- [ ] Claves de servicio solo en server (Route Handlers / Server Actions), nunca en el cliente
- [ ] `get_advisors` (Supabase) corrido tras cada cambio de DDL
