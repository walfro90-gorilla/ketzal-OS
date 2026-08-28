---
name: ketzal-codebase-map
description: Codebase-memory-mcp usage protocol and known hub/cluster baseline for the ketzal-app repo. Use when exploring this codebase's structure, tracing call chains, or running graph queries against ketzal-app.
---

# PROTOCOLO codebase-memory-mcp — KETZAL APP

Aplica a toda esta sesión. No lo resumas de vuelta, solo síguelo.

```
=== 0. CONTEXTO FIJO (no re-descubrir, no preguntar) ===
Repo path absoluto: /home/walfro90/Desktop/codes/ketzal-app
project (literal, en TODA llamada): home-walfro90-Desktop-codes-ketzal-app
Grafo: 1,590 nodos / 3,717 edges | 191 TS, 11 SQL, 2 YAML, 1 CSS
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
