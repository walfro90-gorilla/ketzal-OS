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
3. **Ledger append-only**: cancelaciones/correcciones son asientos nuevos (`payment` tipo `refund`), no updates/deletes. **Desde 2026-07-19 se aplica en la BD, no sólo en la app**: trigger `no_mutar` (BEFORE DELETE OR TRUNCATE) + `REVOKE DELETE,TRUNCATE` sobre `payments`, `receipts`, `receipt_counters`, `system_log`. `bookings` queda fuera a propósito (se actualiza legítimamente). Ver `db/proposed/002_ledger_inmutable.sql`.
4. **Folio de recibo atómico**: secuencia por agencia, sin `count(*)+1`.
5. **Cupos transaccionales**: `current_bookings` vs `max_capacity` dentro de transacción.
6. **No sobre-ingeniería.** Monolito Next.js + Supabase. Nada de microservicios/Kafka/sharding.

## Estado

- [x] Estrategia, alcance y modelo de datos v1 definidos
- [x] Documentos base y SQL escritos
- [x] **Migración v1 APLICADA a `ketzal`** (2026-07-08): `ketzal_os_v1_sales_core` + `ketzal_os_v1_security_hardening`. Advisors de seguridad: **0 errores**.
- [x] Semilla: crear Wanderlust/Border/Snapshot como `suppliers` type='agency' y ligar `profiles.supplier_id`
- [x] Scaffolding de la app Next.js
- [x] Primera pantalla: flujo del agente al cerrar una venta

## Construido — estado real (actualizado 2026-07-09)

> El checklist de arriba quedó corto. Resumen aditivo de lo construido. Detalle vivo en la memoria del proyecto (`ketzal-project`).
>
> **Estado real (corregido 2026-07-19):** el OS está **desplegado en producción y en fase de pruebas — todavía NO hay operación real**. Verificado contra la BD: `bookings`, `payments`, `customers`, `receipts` en **cero**. Sigue en pruebas hasta que esté 100% probado. No confundir "desplegado y funcional" con "en uso": el FODA pesa distinto según cuál sea (ej. los 8 días de Clawbot caído tuvieron daño real cero porque no había nada que cobrar).
>
> **Catálogo público — primer slice vivo (2026-07-20):** el flag `services.published` ya se prende/apaga desde la UI (toggle en la lista de servicios **y** en el formulario de edición, tarjeta "Publicación"). Las rutas públicas `/explora` (`ketzal.list_public_services`) y `/servicio/[id]` (`ketzal.get_public_service`, fail-closed) sirven solo lo publicado. El fundador publicó **2 servicios** (Brasil, Dunas Mágicas Samalayuca) — verificado end-to-end, 0 errores de advisors. Sigue siendo **fase de pruebas** (sin ventas ni operación real); es el primer paso hacia el marketplace B2C 🅰️. Además ya tienen **galería (hasta 20 fotos) + carrusel** en la ficha y **video opcional** (YouTube/Vimeo, `yt_link` en `get_public_service`); `/explora` ordena por precio.
>
> **Marketplace — terreno B.0 aplicado (2026-07-20, dark-launched):** primer paso B2C detrás del flag **`NEXT_PUBLIC_MARKETPLACE`** (off por default; se prende en Vercel + redeploy). Tabla nueva **`ketzal.marketplace_customers`** (comprador B2C, RLS solo-dueño `id = auth.uid()`, **aislada de `profiles`** para no tocar la RLS por agencia). Registro con **email+password** (evita `/auth/callback` → el comprador nunca nace como agente). Ruta **`/comprar/[serviceId]`** (gated): alta rápida → resumen + handoff WhatsApp (sin pago aún). CTA "Comprar en línea" en la ficha. Plan y estado por fases en **`docs/MARKETPLACE_TERRENO.md`**. **B.1 (pedido + endurecer confirmación de comprador) se continúa en Claude console; esta rama sigue con UI/UX.**

**Infra/deploy:** Next.js 16 (App Router) · React 19 · TS · Tailwind 4 · shadcn base-nova (sobre `@base-ui/react`, no radix) · pnpm. Repo `walfro90-gorilla/ketzal-OS` (SSH) → Vercel `ketzal-os` (push a `main` auto-despliega). Prod: **https://ketzal-os.vercel.app**. Migraciones NO versionadas en el repo (Supabase es la fuente, vía `apply_migration`). `middleware.ts`→`proxy.ts` en Next 16; `next build` no falla por lint.

**Auth + tenancy:** magic link / contraseña / Google OAuth / recuperación. Dos tipos de vendedor: **agente de agencia** (`profiles.supplier_id`) y **agente Ketzal libre** (`supplier_id` null, vende todo, comisión de plataforma). Nuevos usuarios nacen **pendientes** (`active=false`) → aprobación de admin. RLS reescrito y probado adversarialmente (sin escalación/spoof/fugas). Helpers: `my_supplier_id`, `is_superadmin`, `is_active`, `ensure_profile`.

**Flujo de venta (RPCs atómicos):** catálogo de servicios → **cotización** (link público `/cotizacion/[token]` + PDF + convertir) → **venta** con líneas (opciones de pasajero + habitación/add-ons) → **abonos** (ledger append-only, saldo derivado) → **recibo** interno (folio atómico por agencia) → **comisiones** (reventa entre agencias / plataforma para libres). Cancelaciones, vencimientos, editor de itinerario.

**Pagos — más allá del v1 original (ampliado con acuerdo del fundador):**
- **Cobro en línea (Mercado Pago Checkout Pro)**: **VALIDADO en producción (2026-07-10)** — pago SPEI real de $20 confirmado end-to-end (webhook `approved` → abono en el ledger). El bloqueo era el token en TEST; con `APP_USR-` de prod cobra bien. (El sandbox de MP nunca sirvió; se validó directo en prod, como se acordó.)
- **Estado de cuenta del cliente** compartible por WhatsApp (link público `/estado/[token]`).
- **Recibo** rediseñado + público/compartible (`/recibo/[uuid]`, cantidad con letra, sello "Liquidada").
- **Plan de pagos (abonos)**: enganche % configurable (default 20%) + abonos semanal/quincenal/mensual hasta la fecha final; invariante suma=total. Tabla `payment_schedule` + RPCs `preview/generate/clear_payment_plan`; `bookings.payment_type`.

**Operación / institucional:** Panel (KPIs + "Requiere atención") · **Reportes** (`/reportes`, gráficas + exportar CSV) · **búsqueda + filtros + ordenar por columna** en todas las listas · **buscador global ⌘K** · **sidebar de escritorio colapsable** · PWA · dark mode · toasts · mobile-first (campo-primero) · borrados con confirmación + guardas de integridad.

**Automatización / cobranza / salud (2026-07-10):**
- **Cobranza** (`/cobranza`): a quién cobrar / quién va atrasado (cruza el plan de pagos con los abonos reales).
- **Clawbot** — motor de automatización: reglas diarias (abono por vencer/vencido, cotización sin cerrar, viaje próximo) → outbox de recordatorios que el agente **envía por WhatsApp con 1 clic** (`/clawbot`) + digest en el Panel. Cron `/api/clawbot/tick` (`vercel.json`, protegido `CRON_SECRET`). Diseñado para subir a envío 100% automático (WhatsApp Business API) sin rehacer el motor.
- **Salud del sistema** (`/salud`, superadmin): chequeo de invariantes de dinero (0 violaciones) + log de eventos (cron, webhook). El cron corre el chequeo a diario.

> **Env vars nuevas:** `CRON_SECRET` (cron de Clawbot). Ya existentes: `MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.
> **Multi-agente:** varios agentes editan el árbol en paralelo. Convención: RPCs nuevos se llaman con cast `supabase.rpc('nombre' as never)` para NO tocar `database.types.ts` (un solo dueño); cada quien commitea SOLO sus archivos (`git add` explícito). Ver `docs/WORKTREES.md`.

**Modelo de 2 agentes (dev):** UI/UX (Fable) dueño de la capa presentacional; backend (Opus) dueño de `actions.ts`, RPCs, RLS, dinero. Ver `docs/UI_UX_PLAN.md` §7.

**Roadmap pendiente (v2+):** notificaciones (WhatsApp/email), facturación CFDI/SAT, catálogo público/marketplace (primer paso B2C). **Pagos:** MP ya validado en prod; a futuro **Openpay** (es de BBVA) para cobrar SPEI conciliable a la cuenta BBVA sin el fee de tarjeta de MP — el campo ya está listo (`payment_intents.provider`, sin cambio de schema). **Por lo pronto: solo MP** (nada de scaffolding de Openpay hasta decidirlo, YAGNI). Detalle en `docs/ROADMAP.md`.

## Docs

- `docs/ARCHITECTURE.md` — stack, principios, seguridad, qué NO hacer
- `docs/DATA_MODEL.md` — modelo de datos v1 completo
- `docs/ROADMAP.md` — fases v1 → v4
- `db/proposed/001_ketzal_os_v1.sql` — migración propuesta (revisar antes de aplicar)

---

# PROTOCOLO codebase-memory-mcp — KETZAL APP

Aplica a toda esta sesión. No lo resumas de vuelta, solo síguelo.

```
=== 0. CONTEXTO FIJO (no re-descubrir, no preguntar) ===
Repo path absoluto: /home/walfro90/Desktop/codes/ketzal-app
project (literal, en TODA llamada): home-walfro90-Desktop-codes-ketzal-app
Grafo: 1,494 nodos / 3,400 edges | 180 TS, 11 SQL, 2 YAML, 1 CSS
Excluido del grafo: node_modules, .next, .git, .vercel, public, docs/

CRÍTICO: docs/ NO está indexado. Si preguntas al grafo por documentación vas a
recibir vacío — eso NO significa que no exista. docs/ es trabajo de Read/Grep.

CRÍTICO: el parámetro project es obligatorio en cada llamada. Si lo omites, el
servidor puede devolver datos de otro repo del mismo store. Es la causa #1 de
resultados fantasma.

=== 1. REGLA DE ORO ===
Antes de cualquier Grep, Glob o barrido de Read: consulta el grafo.
Una query estructural reemplaza decenas de ciclos grep/read.
Grep/Read siguen siendo correctos SOLO para: contenido de docs/, strings
literales, comentarios, configs no indexados, y leer un archivo completo una vez
que el grafo ya te dijo cuál.

=== 2. PROTOCOLO DE 6 FASES (en orden, sin saltarse) ===

FASE 1 — index_repository (solo si hace falta)
  { "repo_path": "/home/walfro90/Desktop/codes/ketzal-app" }
  - Path ABSOLUTO siempre. Relativo falla.
  - NO lo corras por default: ya está indexado. Solo tras detect_changes con
    drift real, o si yo lo pido.
  - El índice es SNAPSHOT, no live. No se actualiza solo por commit.
  - Si la respuesta trae status:"degraded" → avísame. Los nodos persistidos
    quedaron bajo el umbral vs los de memoria; el grafo no es confiable.

FASE 2 — list_projects
  {}
  - Devuelve el "name" de cada proyecto. Ese string exacto es tu parámetro project.
  - Ya lo sé: home-walfro90-Desktop-codes-ketzal-app
  - Córrelo solo si una query falla por proyecto no encontrado.
  - Nunca inventes ni "normalices" el nombre: se deriva del path, lleva guiones.

FASE 3 — get_graph_schema (PRIMERA de las queries, siempre)
  { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  - Te da conteos por label, patrones de relación reales y propiedades por label.
  - Sin esto escribes Cypher contra edges que no existen AQUÍ y filtras por
    propiedades no pobladas.
  - Labels: Project, Package, Folder, File, Module, Class, Function, Method,
    Interface, Enum, Type, Route, Resource
  - Edges: CALLS, IMPORTS, DEFINES, DEFINES_METHOD, IMPLEMENTS, HANDLES,
    HTTP_CALLS, ASYNC_CALLS, USES_TYPE, USAGE, TESTS, FILE_CHANGES_WITH,
    CONTAINS_FILE, CONTAINS_FOLDER, CONTAINS_PACKAGE, MEMBER_OF, WRITES, CONFIGURES

FASE 4 — get_architecture (overview de un solo call)
  { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  - Devuelve lenguajes, packages, entry points, routes, hotspots, boundaries,
    layers y clusters (Louvain) en una llamada.
  - Úsalo para orientarte antes de arquitectura, refactor o "dónde vive X".
  - UNA VEZ por sesión. El baseline ya está en la sección 4 de abajo.

FASE 5 — search_graph (descubre el nombre EXACTO) — NO ES OPCIONAL
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "name_pattern": ".*Booking.*",
    "label": "Function"
  }
  - Es el puente entre "cómo le dice el humano" y "cómo se llama en el grafo".
  - Params: label, name_pattern (regex), file_pattern, min_degree/max_degree
    (hubs o dead code), limit/offset.
  - De AQUÍ sale el qualified name de la Fase 6.
    Formato: <project>.<path_parts>.<name>
  - NUNCA construyas un qualified name a mano. Cópialo del resultado.

FASE 6 — trace_path / get_code_snippet (recién ahora)
  trace_path:
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "function_name": "createBooking",
    "direction": "inbound",
    "depth": 3
  }
  - direction: inbound (quién me llama = blast radius) | outbound (dependencias)
    | both. depth 1-5. No pongas "both" por default: duplica el ruido.

  get_code_snippet:
  {
    "project": "home-walfro90-Desktop-codes-ketzal-app",
    "qualified_name": "<pégalo tal cual desde search_graph>"
  }

=== 3. ANTI-PATRONES — si haces esto, párate ===
- trace_path con nombre adivinado → 0 resultados y concluyes que no existe.
  Correcto: search_graph con .*Parcial.* primero.
- Omitir project → resultados de otro repo o vacío. Siempre pásalo.
- get_code_snippet con nombre armado a mano → falla. Cópialo de search_graph.
- Grep antes del grafo → quemas contexto por lo que una query resuelve.
- index_repository "por si acaso" → costo sin beneficio.
- Buscar docs/ en el grafo → vacío → conclusión falsa. No está indexado.
- Re-derivar la arquitectura cada sesión → el baseline ya está abajo.

=== 4. BASELINE CONOCIDO (úsalo, no lo re-derives) ===
Punto de partida del índice inicial. Verifica contra el grafo si algo depende de esto.

Capa core: lib → 168 llamadas inbound, CERO outbound. Infraestructura pura:
todo depende de ella, ella no depende de nada. Blast radius máximo.

Hubs (el orden cn↔server.createClient y el split del cliente de browser varían
por corrida — resolución LSP; NO re-sincronizar por ±pocos callers):
- src/lib/supabase/server.createClient → ~52–75 callers. Acceso único a Supabase
  server-side. Blast radius máximo.
- src/lib/utils.cn → ~61 callers. Merge de clases Tailwind, en casi todo componente.
- safeError → ~36 callers. Infraestructura compartida (fix P1 del commit 7a202f2).
- src/lib/supabase/client.createClient → hub aparte del cliente de browser (~7–29).

Clusters (Louvain sobre edges CALLS):
- Ventas: NuevaVentaForm / createBooking / updateLine
- Recibos: montoConLetra / centenasALetras — cohesión 1.0 (hermético)
- Reportes/Panel: DashboardPage / GraficaMensual / ReportesPage — cohesión 0.89
- WhatsApp reader: leerProductoWhatsApp / extraerConGroq — cohesión 0.89
- Marketplace/comprador: ComprarPage / ServicioPublicoPage / PedidoForm (B.1-1)
- Servicios/OG/imágenes: ServicioForm / ogCardResponse / setServicioImagen
Nota: Louvain reordena qué módulo hermético (Recibos/Webhook MP) sale al tope
por corrida; ambos son reales a cohesión 1.0.
Los de cohesión 1.0 son módulos herméticos: candidatos a extraer, y zonas donde
un cambio interno no se propaga afuera.

=== 5. MANTENIMIENTO ===
detect_changes → { "project": "home-walfro90-Desktop-codes-ketzal-app" }
  Mapea el git diff a símbolos afectados + blast radius + clasificación de riesgo.
  CÓRRELO ANTES de tocar lib/ o cualquier hub de la sección 4.
  Córrelo tras un batch de edits para decidir si vale re-indexar.

query_graph → Cypher READ-ONLY, subset de openCypher.
  Dead code: MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50
  Soporta: MATCH, OPTIONAL MATCH, WHERE, WITH, RETURN, ORDER BY, SKIP, LIMIT,
  DISTINCT, UNWIND, UNION, CASE, paths variables [*1..3], EXISTS{} de un salto,
  agregados (count/sum/avg/min/max/collect).
  NO soporta: escritura, MERGE, CALL, list/map literals, comprehensions, params.
  Lo no soportado falla con error "unsupported ..." — si ves eso, el grafo NO
  está vacío: tu query salió del subset.

search_code → grep aumentado por grafo, solo sobre archivos indexados. No alcanza docs/.

=== 6. PENDIENTES ABIERTOS A PROPÓSITO (no ejecutar sin que yo lo pida) ===
- manage_adr: vale solo cuando una decisión de arquitectura merezca congelarse
  por escrito en vez de re-derivarse. Propónmelo ante una decisión estructural
  real (extraer el cluster de recibos, cambiar el contrato del webhook de MP).
- persistence: true → escribe .codebase-memory/graph.db.zst, snapshot zstd
  commiteable para que otra máquina/agente use el grafo sin re-indexar.
  Propónmelo cuando entre un segundo agente o máquina. Antes es peso muerto.

=== 7. CÓMO QUIERO LAS RESPUESTAS ===
- Español, directo, nivel senior. Sin preámbulo ni "voy a hacer X".
- Si una query devuelve vacío, DILO y di por qué crees que fue: nombre
  incorrecto, fuera del subset, o fuera del índice. No rellenes con suposiciones.
- Al citar un símbolo, dame el qualified name real del grafo, no una aproximación.
- Si el grafo y el disco se contradicen, GANA EL DISCO y avísame que hay drift.
```
