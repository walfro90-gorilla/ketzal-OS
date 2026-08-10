# Ketzal OS

Back-office multi-agencia para operadoras de viajes: venta con líneas de precio,
abonos (ledger append-only), recibos foliados, cotizaciones, comisiones,
cobranza, salidas/manifiesto, y una vitrina pública/marketplace B2C detrás de
un flag. Construido para las agencias reales del fundador (Wanderlust Travels,
Border Travels, Snapshot) como el primer paso de la visión de largo plazo:
"uberizar" los servicios turísticos de Chihuahua → México → LATAM.

Contexto de negocio, alcance y reglas de oro (no negociables) en **`CLAUDE.md`**
— léelo antes de tocar código. Detalle del modelo de datos en
**`docs/DATA_MODEL.md`**, arquitectura en **`docs/ARCHITECTURE.md`**.

**¿Quieres saber qué hace cada pantalla y quién puede verla?** →
**[`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md)**.

## Stack

- **Next.js 16** (App Router) + **TypeScript**, React 19, Tailwind 4
- **shadcn/ui** (base-nova, sobre `@base-ui/react`, no radix)
- **Supabase** (Postgres 17, Auth, Storage, RLS) — proyecto Gorilla-Labs,
  schema `ketzal`. Migraciones NO viven en el repo: Supabase es la fuente de
  verdad; los espejos de referencia están en `db/proposed/`
  (`bNNN_` = carril backend/dinero, `mNNN_` = carril marketplace/viajero)
- **vitest** para la lógica de dominio pura (`src/lib/domain/`)
- **pnpm** como package manager
- Despliegue: **Vercel** (push a `main` auto-despliega a
  https://ketzal-os.vercel.app)

## Arrancar en local

```bash
pnpm install
cp .env.local.example .env.local   # y llena las variables (ver abajo)
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente de Supabase (obligatorias) |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones server-side que saltan RLS (invitaciones, OAuth de MP, etc.) |
| `GROQ_API_KEY` / `GROQ_MODEL` | Lector de volantes (PDF/imagen → servicio) en `/servicios/nuevo` |
| `MP_ACCESS_TOKEN` | Token de plataforma de Mercado Pago (checkout sin split) |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | App marketplace de MP — habilita el OAuth de split por agencia (`/api/mp/oauth/*`). Sin ellas, el botón "Conectar mi Mercado Pago" responde 501 y todo opera con el token único |
| `MP_WEBHOOK_SECRET` | Valida las notificaciones del webhook de MP |
| `CRON_SECRET` | Protege `/api/clawbot/tick` (el cron de recordatorios) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Notificaciones push (Web Push) |
| `NEXT_PUBLIC_MARKETPLACE` | Flag: enciende la vitrina B2C (`/comprar`, reseñas, etc.) |
| `NEXT_PUBLIC_APP_URL` | Override del origin público (redirect URIs, links compartibles); si falta, se usa el origin de la request |

## Comandos

```bash
pnpm dev            # servidor de desarrollo
pnpm build           # build de producción
pnpm test            # vitest (lógica de dominio, src/lib/domain/)
npx tsc --noEmit      # typecheck
```

CI (`.github/workflows/test.yml`) corre `tsc` + `pnpm test` en cada PR y en
`main`.

## Estructura

```
src/app/(ops)/    back-office (agente/admin/superadmin) — venta, cobranza, catálogo, comisiones…
src/app/(travel)/ portal del viajero — sus viajes, plan de pagos, perfil
src/app/embajador/  portal del embajador — ganancias + link de referido
src/app/proveedor/  portal del proveedor operativo — sus servicios, solo lectura
src/app/explora/ , /agencias/ , /servicio/ , /comprar/   vitrina pública + checkout
src/app/api/       endpoints (Mercado Pago, Clawbot cron)
src/lib/domain/    lógica de dinero pura, con tests (pricing, balance, planes, etc.)
db/proposed/       espejo de las migraciones aplicadas a Supabase (referencia, no fuente)
docs/              contexto de negocio, modelo de datos, manual de usuario, roadmap
```

## Documentación

- **`CLAUDE.md`** — visión, alcance v1, reglas de oro, y el log completo de lo construido
- **`docs/MANUAL_USUARIO.md`** — qué hace cada sección y quién tiene acceso
- **`docs/DATA_MODEL.md`** — modelo de datos
- **`docs/ARCHITECTURE.md`** — stack, principios, seguridad
- **`docs/ROADMAP.md`** — fases v1 → v4
- **`docs/WORKTREES.md`** — cómo se coordina el trabajo en carriles paralelos
