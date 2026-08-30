# ADR-0020 — La revisión de seguridad automática se difiere hasta producción

- Estado: aceptada · Fecha: 2026-08-29 · Sustituye: —
- Alcance: `.github/workflows/security-review.yml` (eliminado), proceso de PR

## Contexto
El repo tenía un workflow `security-review.yml` que en cada PR levantaba
`anthropics/claude-code-security-review`: lee el diff (no ejecuta el código),
busca vulnerabilidades de authz/RLS, secretos hardcodeados, injection e IDOR, y
comenta los hallazgos en el PR. Nunca funcionó: requiere el secreto
`CLAUDE_API_KEY` y el repo no tiene ninguno configurado (`gh secret list`
devuelve vacío).

Hasta ahora eso pasaba desapercibido porque el workflow solo dispara en
`pull_request` y el trabajo venía entrando por push directo a `main`. El PR #69
(2026-08-29) fue el primero en activarlo, y falló en 30 segundos con
`ANTHROPIC_API_KEY is not set` — dejando el PR con un check rojo que no dice
nada del código: ni siquiera llegó a leerlo.

El detalle que confunde: el secreto se llama **`CLAUDE_API_KEY`** en GitHub; el
mensaje de error menciona `ANTHROPIC_API_KEY` porque así se llama la variable
dentro de la action. Poner el secreto con el nombre del error no funciona.

## Decisión
**Se elimina el workflow** en vez de dejarlo fallando. Un check rojo permanente
que hay que ignorar entrena al equipo a ignorar los checks rojos, y el día que
uno se ponga rojo de verdad va a parecer el de siempre. Un check que no puede
correr no es una red de seguridad: es ruido con forma de red.

**Se reimplanta cuando el OS entre en operación real**, que es cuando el costo
de una fuga deja de ser hipotético (hoy la BD está limpia y sin operación). En
ese momento: cargar `CLAUDE_API_KEY` en Settings → Secrets and variables →
Actions y restaurar el archivo desde este ADR o desde el historial de git.

**Mientras tanto la cobertura es manual y no opcional**: `/security-review` o
`/code-review` a mano en todo carril que toque RLS, dinero, PII o superficie
anónima, más los harness adversariales de `supabase/tests/`. No es un
equivalente —depende de que alguien se acuerde— y por eso es un diferimiento,
no una cancelación.

## Consecuencias
- Los PR quedan con `test`, `mcp` y Vercel como únicos checks. Verde ya no
  incluye ninguna lectura de seguridad: hay que pedirla explícitamente.
- La deuda es real y con dueño: el fundador carga el secreto al arrancar
  operación. Anotado también en `docs/BITACORA.md`.
- Precedente que este mismo día costó caro (m003, m004): los bugs que ese
  revisor caza —permisos que la UI esconde pero PostgREST expone— son
  exactamente los que han reincidido cuatro veces en este repo. La revisión
  manual del PR #69 encontró 7 hallazgos reales, uno de los cuales dejaba la
  sección inservible para el superadmin. Sin ella, se habrían mergeado.

## Verificación
`gh secret list` vacío y el log del run 33273181347 con
`##[error]ANTHROPIC_API_KEY is not set` son la evidencia de que el check no
revisaba nada. Tras eliminarlo, el PR #69 queda con los tres checks reales en
verde.

## Fuentes
PR #69, run 33273181347, `.github/workflows/security-review.yml` (en el
historial de git), memoria `seguridad-rls-postgrest`.
