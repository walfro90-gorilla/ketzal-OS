# ADR-0001 — Las decisiones de arquitectura viven en `docs/adr/`, dentro del repo

- Estado: aceptada · Fecha: 2026-08-27 · Sustituye: —
- Alcance: todo el proyecto; proceso de los carriles multi-agente

## Contexto
Las decisiones vivían repartidas en 5 sustratos (changelog de CLAUDE.md, docs
sueltos, espejos SQL, memoria de agentes, logs de coordinación) y ya se pagó el
costo: `docs/FINANZAS_PLATAFORMA.md` apuntaba a una memoria de
codebase-memory que dejó de existir en disco, y CLAUDE.md llegó a 84KB (~21K
tokens cargados en CADA sesión) con 92.5% de narrativa.

## Decisión
- Toda decisión estructural se registra como ADR en `docs/adr/NNNN-slug.md`
  (numeración secuencial global; `ls docs/adr/` antes de numerar, mismo
  cuidado que con `bNNN_`).
- Formato: cabecera (Estado/Fecha/Sustituye/Alcance) + Contexto + Decisión
  (normativa: DEBE/NUNCA) + Consecuencias + Verificación + Fuentes. Típico
  <60 líneas, tope 200.
- **Inmutables**: cambiar de opinión = ADR nuevo con `Sustituye: ADR-XXXX`;
  el viejo solo cambia su línea de Estado a `sustituida por ADR-YYYY`.
- **Gate obligatorio**: el carril que toma una decisión estructural (tabla de
  dinero nueva, cambio de contrato de RPC compartido, dependencia nueva,
  cambio de infra/seguridad, descarte de alternativa) escribe su ADR ANTES de
  mergear y actualiza `docs/adr/README.md` en el mismo diff.
- Las decisiones NUNCA viven solo en memoria de agentes ni en stores fuera
  del repo (`manage_adr` de codebase-memory NO es fuente): git es la fuente.

## Consecuencias
- Cualquier sesión (humana o agente) recupera las reglas del juego leyendo el
  índice + los ADRs relevantes, sin cargar 84KB de historia.
- La historia narrativa se conserva en `docs/BITACORA.md` (verbatim); un ADR
  no re-cuenta historia, congela una regla viva.
- Costo: ~10 min por decisión estructural. Sin el gate, el índice se pudre
  (destino documentado de los "Avisos entre agentes" de WORKTREES.md).

## Verificación
`docs/adr/README.md` lista todos los archivos de `docs/adr/` sin huecos de
numeración; CLAUDE.md referencia el índice.

## Fuentes
Auditoría 2026-08-27 (CLAUDE.md 84KB/92.5% changelog; puntero colgante en
FINANZAS_PLATAFORMA.md); adr.github.io / MADR; docs oficiales de Claude Code
(memoria: CLAUDE.md <200 líneas, sin narrativa).
