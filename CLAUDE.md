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
9. **Todo link que va a un cliente sale de `origenPublico()`**
   (`src/lib/site-url.ts`), nunca de `window.location.origin` ni del header
   `host`: hay un solo dominio público (`ketzal.tours`); `os.` y el
   `vercel.app` viejo no se le mandan a nadie.
   → [ADR-0040](docs/adr/0040-un-solo-dominio-publico-para-los-links.md)
10. **Un gate de seguridad se hace cumplir en `src/proxy.ts`**, nunca con un
    `redirect()` de layout o de página: donde hay streaming el redirect ocurre
    y los datos ya viajaron en el flight.
    → [ADR-0045](docs/adr/0045-el-gate-de-seguridad-no-vive-en-un-layout.md)
11. **Un módulo no mezcla contrato puro con acarreo de plataforma.** Lo puro
    (tipos, formateadores, funciones sobre datos) vive en un módulo hoja que
    importan los dos lados; ni un Server Component llama a algo exportado por
    un `'use client'`, ni un módulo de cliente importa uno que arrastre
    `node:*`. **La frontera cuesta distinto según la dirección**: de cliente a
    servidor truena en `next build`; de servidor a cliente compila, despliega
    y falla en runtime **sirviendo un 200** — el expediente de `/usuarios`
    vivió así 11 días con CI en verde. Esa mitad solo la ataja un harness que
    exija CONTENIDO, no status.
    → [ADR-0043](docs/adr/0043-la-frontera-cliente-servidor-no-se-cruza-con-un-helper.md)

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
  auto-despliega). Prod: **https://ketzal.tours** (vitrina) y
  **https://os.ketzal.tours** (back-office; hoy ambos sirven todo);
  `ketzal-os.vercel.app` redirige 308 al apex, `/api` sigue ahí.
  `middleware.ts`→`proxy.ts` en Next 16; `next build` no falla por lint.
- Migraciones: BD = fuente de verdad, espejos `db/proposed/`, snapshot
  `supabase/snapshots/ketzal_schema.sql`
  → [ADR-0014](docs/adr/0014-migraciones-bd-fuente.md)
- Env vars clave: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_CLIENT_ID/SECRET`,
  `CRON_SECRET`, `VAPID_*`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `WHATSAPP_VENTAS`
  (contacto comercial de la home; sin él no hay botón de WhatsApp), `GROQ_API_KEY`
  (+ `GROQ_AGENT_MODEL`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` del asistente),
  `INDEXNOW_KEY` (avisa a Bing al publicar un tour; sin ella es no-op y
  `/indexnow-key.txt` da 404).

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
- **Asistente IA en el OS** (botón flotante, solo superadmin): las mismas
  herramientas del MCP en-proceso con el JWT de quien pregunta; dinero solo
  tras clic; Groq → Gemini → DeepSeek por `fetch`
  → [ADR-0044](docs/adr/0044-el-asistente-del-os-reusa-las-herramientas-del-mcp.md).
- **WhatsApp** (Baileys en box, pausado esperando número)
  → [ADR-0017](docs/adr/0017-whatsapp-baileys-box.md).
- **El prospecto cotizado guarda su cotización en una cuenta de viajero**
  (`claim_quote` por token; el correo liga solo verificado; venta manual =
  solo lectura en el portal) → [ADR-0039](docs/adr/0039-la-cotizacion-se-guarda-con-su-token.md).
  **Confirm email se PAUSA hasta Pro**: con la plantilla por defecto el enlace
  es PKCE y no confirma desde otro aparato (el caso de WhatsApp)
  → [ADR-0041](docs/adr/0041-la-confirmacion-de-correo-se-pausa-hasta-pro.md).
  El camino está probado y listo (`confirmacion_email.mjs`); para prenderlo:
  Pro + pegar `supabase/templates/confirm-signup.html`.
- **Dominio propio** `ketzal.tours` (+ `os.`, `www.` → apex) desde 2026-09-03
  → [ADR-0040](docs/adr/0040-un-solo-dominio-publico-para-los-links.md).
  Modal "instala la app" solo en celular en los tres shells.
- **BD limpia para operación real** (reset 2026-08-19; catálogo conservado).
  Migrada a proyecto dedicado 2026-08-26 — pendientes del fundador en la
  bitácora (exposed schemas, Auth dashboard, env vars Vercel, box WA, npm).
- Tests: 239 de dominio (raíz) + 76 MCP, ambos en CI. Los **hard-tests**
  (`supabase/tests/`, 34, hoy **34/34**)
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
- `docs/PLAN_COMERCIAL.md` — **plan de arranque comercial + checklist vivo**
- `docs/OPERACION_VIAJE.md` · `docs/FINANZAS_PLATAFORMA.md` ·
  `docs/COMISIONES_MOTOR.md` · `docs/PLAN_CANCELACIONES.md`
- `docs/WORKTREES.md` + `db/proposed/README.md` — coordinación multi-carril
- `wa-sender/DEPLOY_STATUS.md` — runbook WhatsApp · `mcp/README.md` — MCP
