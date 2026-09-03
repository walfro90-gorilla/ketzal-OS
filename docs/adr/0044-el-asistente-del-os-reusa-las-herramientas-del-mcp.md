# ADR-0044 — El asistente IA del OS reusa las herramientas del MCP en-proceso, con el JWT de quien pregunta y el dinero detrás de un clic

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** ninguna (no toca la BD)
- **Sustituye a:** ninguno
- **Toca:** `src/app/api/agente/route.ts` (nuevo) · `src/lib/agente/{llm,tools,conversacion}.ts`
  (nuevos) · `src/components/shell/agente.tsx` + `app-shell.tsx` (botón flotante) ·
  `mcp/src/session.ts` (`tokenScope`, aditivo) · `next.config.ts` + `scripts/mcp-import-loader.cjs`
  (loader de Turbopack) · `package.json` (`zod`)
- **Relacionadas:** [ADR-0013](0013-mcp-usuario-real.md) (el MCP se autentica como usuario real),
  [ADR-0004](0004-tenancy-rls-por-agencia.md) (la RLS decide),
  [ADR-0006](0006-ledger-append-only-rpc-only.md) (un abono mal puesto es un contra-asiento),
  [ADR-0003](0003-monolito-sin-sobreingenieria.md) (dependencia nueva = decisión)

## Contexto

El fundador quiere operar el OS desde un chat dentro del OS ("registra un abono
de 500 a la venta de Juan", "¿qué quedó por cobrar?") sin abrir una terminal.
Ya existe todo el vocabulario: el MCP (`mcp/src/tools`) tiene 38 herramientas
con schema `zod`, descripción pensada para un LLM y handler que pega a
PostgREST con el JWT del usuario. Y ya existe la forma de hablarle a un LLM sin
SDK: el lector de volantes hace `fetch` a Groq.

Lo que NO conviene: un segundo catálogo de herramientas para el chat (dos
listas que se desincronizan), un SDK de agentes para lo que son 60 líneas, y
que un modelo se auto-apruebe un movimiento de dinero en un ledger que no
borra.

Hoy es solo para el superadmin; después lo tendrán los admins de agencia.

## Decisión

1. **Las herramientas del chat SON las del MCP, importadas en-proceso.**
   `ToolDef` ya era agnóstico del transporte ("no sabe nada de MCP"), así que
   `src/lib/agente/tools.ts` las traduce al dialecto OpenAI con
   `z.toJSONSchema` y las ejecuta llamando `handler` directo. Lo que se agregue
   al MCP lo tiene el chat sin tocar nada. `ketzal_subir_fotos` se excluye:
   lee archivos del disco de quien corre el MCP y en el servidor no hay tal
   disco.
2. **Corren con el JWT de la cookie de quien pregunta, nunca con service
   role.** `mcp/src/session.ts` gana `tokenScope` (`AsyncLocalStorage`): si hay
   un token en el scope de la petición, `getAccessToken()` lo devuelve en vez
   de leer el disco. La RLS y los guards de los RPC deciden exactamente igual
   que en el MCP. Por eso escalarlo a los admins de agencia es **quitar el
   `if (role !== 'superadmin')`** de la ruta y nada más.
3. **El dinero y lo destructivo no corren sin clic.** Una tool_call con
   `money` o `destructive` no se ejecuta: la ruta emite `confirmar`, corta el
   stream y el cliente muestra Confirmar/Cancelar. Confirmar re-manda la misma
   conversación con el id aprobado; cancelar inserta un mensaje `tool` de
   cancelación para que el modelo solo conteste. `confirmar: true` (el guard
   del MCP) lo pone el servidor DESPUÉS del clic; el modelo nunca lo decide.
   Freno anti-bucle: `MAX_PASOS = 12` llamadas al LLM por petición; al topar,
   el turno con tool_calls pendientes se tira para que la siguiente petición
   no lo ejecute a espaldas de la persona.
4. **LLM por `fetch`, sin SDK ni gateway.** Groq, Gemini y DeepSeek exponen el
   mismo `/chat/completions` con `tools`; una función y una lista ordenada son
   el fallback. Se salta al siguiente **solo por transporte** (red, 429, 5xx):
   un 4xx es una petición mal armada por nosotros y se reporta. Con una sola
   llave funciona; sin ninguna, el chat dice qué falta.
5. **Sin estado en el servidor.** El cliente manda la conversación completa en
   formato OpenAI y recibe eventos NDJSON (`tool`, `resultado`, `confirmar`,
   `texto`, `fin`); guarda el historial en `sessionStorage`. Una tabla de
   conversaciones llega cuando lo usen varios admins y haga falta auditar.
6. **Turbopack no remapea `./x.js` → `x.ts`.** El MCP compila con `NodeNext`
   (exige la extensión) y Turbopack no la resuelve, así que un loader de una
   línea (`scripts/mcp-import-loader.cjs`, solo para `mcp/src/**`) quita la
   extensión al importar. El paquete publicado no cambia.
7. **`zod` entra a las dependencias de la app** (ya era la del MCP): los
   schemas de las herramientas SON objetos zod y se validan en runtime.

## Alternativas descartadas

- **Herramientas propias del chat** llamando los RPC directo: duplica 37
  descripciones y schemas que hoy viven en un solo lugar y que se prueban solos.
- **Hablar con el MCP por subproceso o HTTP**: Vercel no sostiene un proceso
  hijo con sesión en disco, y sería un salto de red para llamar código que
  está a tres carpetas.
- **AI SDK / AI Gateway**: hacen bien streaming, tools y fallback, pero son
  una dependencia (y un proveedor) para lo que aquí son 60 líneas con el
  mismo patrón que ya usa el lector de volantes.
- **Pre-bundle del MCP con esbuild** en el build: resuelve lo mismo que el
  loader, pero con dependencia nueva, archivo generado y dos scripts tocados.
- **Streaming de tokens**: los turnos van llenos de tool calls; lo que la
  persona necesita ver en vivo es *qué herramienta corre*, y eso sí se
  transmite. Tokens cuando la espera duela.

## Consecuencias

- Prompt injection vía datos (un cliente llamado "ignora las instrucciones…")
  solo puede hacer lo que la persona ya puede hacer, y para dinero necesita
  su clic. Aceptable para superadmin; cuando escale, revisar.
- La llave de Groq está marcada *Sensitive* en Vercel: `vercel env pull` no la
  trae. Para probar el modelo en local se pega a mano en `.env.local`.
- Las llaves nuevas (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, modelos opcionales)
  las pone el fundador en Vercel; sin ellas el fallback simplemente las salta.
- **`mcp/src/` ahora viaja a Vercel.** `.vercelignore` excluía `mcp/` entero
  ("corre en la máquina del usuario"); eso dejó de ser toda la verdad y el
  build moría con `Can't resolve '../../../mcp/src/tools/index'`. Se excluye
  todo lo demás del paquete (su `dist/`, sus tests, su lockfile y su
  `pnpm-workspace.yaml`, que si viajan hacen que Next infiera mal la raíz).
- **`ToolDef` vive en `mcp/src/tools/tipos.ts`, no en `registry.ts`.** Ahí se
  importa el tipo `McpServer` del SDK, que es dependencia de `mcp/` y no de la
  raíz; como `pnpm-workspace.yaml` no declara `packages:`, un install desde la
  raíz nunca la baja y CI moría con `TS2307`. En un árbol de trabajo pasaba en
  verde por un `mcp/node_modules` viejo. El `exclude: ["mcp"]` del tsconfig no
  ayuda: solo acota el conjunto inicial, y lo alcanzado por un import se
  type-checkea igual.
- El cambio en `mcp/src/session.ts` es aditivo: sin scope, el MCP de terminal
  se comporta igual (76 tests del paquete en verde). No hace falta publicar.

## Verificación

- `src/lib/agente/conversacion.test.ts`: *"dinero sin aprobación: pide
  confirmar y se corta SIN ejecutar"*, *"reanuda con el id aprobado"*,
  *"cancelación: el mensaje tool del cliente cierra el turno"*, *"paralelo:
  corre la lectura y se detiene en la de dinero"*, *"freno anti-bucle"*,
  *"recortar nunca parte un turno"*.
- `src/lib/agente/llm.test.ts`: *"salta al siguiente con 5xx, 429 y red"*,
  *"un 4xx es bug nuestro: se reporta, NO se prueba con otro"*.
- `src/lib/agente/tools.test.ts`: *"todas las del MCP menos subir_fotos, como
  funciones OpenAI válidas"* (las 37 pasan por `z.toJSONSchema`), *"la de
  dinero recibe confirmar:true"*.
- `supabase/tests/agente_gates.mjs` (hard-test, necesita app). Cada negación
  afirma tres cosas —status, el `error` exacto del cuerpo y que **no salió
  ningún evento de herramienta**— porque un 200 con `{"error":…}` pasa como
  verde si solo se mira el status (ADR-0043). Las posiciones probadas son
  *"sin sesión → 401"*, *"admin de agencia (no superadmin) → 403"*,
  *"agente raso → 403"* y *"agente raso pidiendo un abono YA aprobado → 403"*
  (el gate corta antes de ejecutar). Además: *"resultado ok y es LA
  cuenta efímera (su JWT, no otro)"*, *"dinero sin aprobar: primer evento es
  confirmar"*, *"… y NO se emitió ningún tool"*, *"dinero aprobado: ahora sí
  emite tool"*. Corrió 13/13 el 2026-09-03 contra la BD real con cuentas
  efímeras (limpieza verificada).
