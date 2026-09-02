# Ketzal — Guía del proyecto

> Contexto para cualquier sesión (humana o agente). Léelo completo; el
> detalle vive en **`docs/adr/`** (reglas del juego), **`docs/BITACORA.md`**
> (historia de construcción, verbatim) y `docs/` (referencia profunda).

## Qué es Ketzal

Visión: "uberizar" los servicios turísticos de Chihuahua → México → LATAM.
**Se construye en dos tiempos** ([ADR-0002](docs/adr/0002-estrategia-dos-tiempos.md)):
🅱️ **Ketzal OS** (back-office de ventas de las agencias del fundador —
construido, en pruebas) primero; 🅰️ **marketplace B2C** se enciende por
rebanadas sobre la oferta real que el OS siembra. El fundador (Walfre) opera
3 agencias reales: **Wanderlust Travels**, **Border Travels** y **Snapshot**.
Monetización hipótesis: comisión por reserva + afiliación (fase posterior).

## Alcance v1 (decidido — no expandir sin acuerdo explícito)

Venta + abonos + recibo interno (no fiscal), multi-agencia, con ledger de
dinero (registrar, no procesar salvo Mercado Pago). Fuera a propósito:
CFDI/SAT, cálculo social/gamificado, cualquier cosa del sueño 🅰️ sin su fase.

## Reglas de oro (no negociables — detalle y porqué en su ADR)

1. **RLS por `supplier_id` en todo**; agencias = filas `suppliers`
   type='agency'; guards DEFINER con `coalesce(...,false)`.
   → [ADR-0004](docs/adr/0004-tenancy-rls-por-agencia.md)
2. **Dinero SIEMPRE derivado**, nunca columna mutable.
   → [ADR-0005](docs/adr/0005-dinero-derivado.md)
3. **Ledger append-only con enforcement EN BD**; toda tabla de dinero =
   RPC-only-write (GRANT + policy sin columnas = escritura arbitraria por
   PostgREST). → [ADR-0006](docs/adr/0006-ledger-append-only-rpc-only.md)
4. **Folios atómicos** por contador (agencia, serie); nunca `count(*)+1`.
   → [ADR-0007](docs/adr/0007-folios-atomicos.md)
5. **Cupos transaccionales** por salida; carreras se resuelven en la BD.
   → [ADR-0008](docs/adr/0008-cupos-transaccionales.md)
6. **No sobre-ingeniería**: monolito Next.js + Supabase.
   → [ADR-0003](docs/adr/0003-monolito-sin-sobreingenieria.md)
7. **MXN autoritativo** (USD solo se anota/deriva).
   → [ADR-0009](docs/adr/0009-mxn-autoritativo.md)
8. **Un documento con datos de una persona NUNCA vive en bucket público**
   (bucket privado + URL firmada); ninguna policy de storage scopea solo por
   `bucket_id`. → [ADR-0036](docs/adr/0036-el-bucket-publico-no-guarda-documentos.md)

## Proceso ADR (obligatorio)

Decisión estructural (tabla de dinero nueva, cambio de contrato de RPC
compartido, dependencia nueva, cambio de infra/seguridad, descarte de
alternativa) ⇒ el carril escribe su ADR **antes de mergear** y actualiza
`docs/adr/README.md` en el mismo diff. Cambiar una decisión = ADR nuevo que
sustituye; el viejo no se edita. Formato y numeración:
[ADR-0001](docs/adr/0001-registro-de-decisiones.md). La crónica de lo
construido va a `docs/BITACORA.md` (entrada nueva arriba), **nunca de vuelta
aquí**.

Si el ADR **afirma un invariante de runtime** ("esto está bloqueado", "siempre
pasa Z"), su sección *Verificación* nombra el **archivo y la aserción** que lo
prueban — prosa como "probado contra la BD real" no cuenta
→ [ADR-0034](docs/adr/0034-la-verificacion-nombra-su-prueba.md).

## Stack e infra

- **Next.js 16** (App Router) + React 19 + TS + Tailwind 4 + shadcn
  base-nova (sobre `@base-ui/react`, NO radix) · pnpm · vitest (`pnpm test`).
- **Supabase** (Postgres 17, Auth, Storage, RLS) — proyecto **Ketzal-OS**
  (`uznqmmeqwbbjkotbxwsw`, org ECS, dedicado desde 2026-08-26
  → [ADR-0015](docs/adr/0015-proyecto-supabase-dedicado.md)), schema
  **`ketzal`**, bucket **`ketzal-assets`**.
- Repo `walfro90-gorilla/ketzal-OS` → Vercel `ketzal-os` (push a `main`
  auto-despliega). Prod: **https://ketzal-os.vercel.app**.
  `middleware.ts`→`proxy.ts` en Next 16; `next build` no falla por lint.
- Migraciones: BD = fuente de verdad, espejos `db/proposed/`, snapshot
  `supabase/snapshots/ketzal_schema.sql`
  → [ADR-0014](docs/adr/0014-migraciones-bd-fuente.md)
- Env vars clave: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID/SECRET`,
  `CRON_SECRET`, `VAPID_*`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `GROQ_API_KEY`.

## Estado actual (corto — historia completa en `docs/BITACORA.md`)

- **OS completo y en pruebas** (aún SIN operación real): catálogo,
  cotización→venta estricta (b070/b071), abonos, recibos, vouchers+QR,
  pasajeros/salidas/manifiesto, gastos+CxP, metas, comisiones (motor
  append-only, embajador+agente), cobranza, Clawbot, reportes, PWA.
- **Marketplace B2C encendido**: vitrina pública, checkout MP (Split
  activado, Wanderlust conectada), SPEI/efectivo con comprobante, plan de
  pagos, asientos, crédito por cancelación
  → [ADR-0010](docs/adr/0010-cancelacion-politica-congelada-credito.md),
  [ADR-0011](docs/adr/0011-ledger-espeja-no-recrea.md),
  [ADR-0016](docs/adr/0016-pagos-solo-mp.md).
- **Identidad única** `profiles.type` (agente/viajero/embajador/proveedor) +
  SaaS delegado (invitaciones, roles)
  → [ADR-0012](docs/adr/0012-identidad-unica-profiles-type.md).
- **MCP** (`mcp/`, npm `ketzal-mcp` v0.4): opera el OS en lenguaje natural
  como usuario real → [ADR-0013](docs/adr/0013-mcp-usuario-real.md).
- **WhatsApp** (Baileys en box, pausado esperando número)
  → [ADR-0017](docs/adr/0017-whatsapp-baileys-box.md).
- **BD limpia para operación real** (reset 2026-08-19; catálogo conservado).
  Migrada a proyecto dedicado 2026-08-26 — pendientes del fundador en la
  bitácora (exposed schemas, Auth dashboard, env vars Vercel, box WA, npm).
- Tests: 174 de dominio (raíz) + 57 MCP, ambos en CI. Los **hard-tests**
  (`supabase/tests/`, 23, hoy **23/23**)
  corren con **`pnpm hard-test`** (`-v` para el detalle) y **NO están en CI** —
  necesitan la service key y no hay staging
  → [ADR-0034](docs/adr/0034-la-verificacion-nombra-su-prueba.md). Requieren
  `DATABASE_URL` en `.env.local` (solo local, nunca en Vercel).
  **Un hard-test `.sql` NUNCA commitea**: crea lo suyo y revierte; el corredor
  lo obliga (abre la transacción y la revierte él). Ya hubo dos escapes a
  producción por saltarse esto
  → [ADR-0035](docs/adr/0035-un-hard-test-nunca-commitea.md).

## Convenciones multi-agente (varios agentes editan `main` en paralelo)

- Worktrees por carril (`docs/WORKTREES.md`); **`git add` explícito** (nunca
  `-A`/`.` — hay guard hook); rutas con brackets son glob en pathspecs.
- `database.types.ts` tiene UN dueño: RPCs/columnas nuevos van con cast
  `supabase.rpc('nombre' as never)`.
- Espejo de migración: `ls db/proposed/` + revisar `schema_migrations` antes
  de tomar número (`bNNN_` backend / `mNNN_` marketplace).
- Funciones compartidas de BD se re-aplican **aditivamente desde el DDL
  vivo** (leerlo antes; conservar keys/checks de otros carriles).
- Modelo de 2 agentes: UI/UX (Fable) capa presentacional; backend (Opus)
  `actions.ts`, RPCs, RLS, dinero (`docs/UI_UX_PLAN.md` §7).
- Grafo de código: usar la skill **`ketzal-codebase-map`**
  (codebase-memory-mcp) antes de Grep/barridos.

## Docs

- `docs/adr/` — **reglas del juego** (empezar aquí)
- `docs/BITACORA.md` — historia de construcción completa, verbatim
- `docs/ARCHITECTURE.md` · `docs/DATA_MODEL.md` · `docs/ROADMAP.md`
- `docs/OPERACION_VIAJE.md` · `docs/FINANZAS_PLATAFORMA.md` ·
  `docs/COMISIONES_MOTOR.md` · `docs/PLAN_CANCELACIONES.md`
- `docs/WORKTREES.md` + `db/proposed/README.md` — coordinación multi-carril
- `wa-sender/DEPLOY_STATUS.md` — runbook WhatsApp · `mcp/README.md` — MCP
