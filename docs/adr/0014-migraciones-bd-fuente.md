# ADR-0014 — Migraciones: la BD es la fuente; espejos `db/proposed/` + snapshot pg_dump versionado

- Estado: aceptada · Fecha: 2026-07-12 (espejos) / 2026-07-20 (snapshot) · Sustituye: —
- Alcance: todo cambio de schema; coordinación multi-carril

## Contexto
Las migraciones se aplican con `apply_migration` (MCP de Supabase) directo a
prod; el historial vive en la BD. En el proyecto compartido original,
`db pull/push` era inviable (historial global mezclado con apps hermanas).
Además dos carriles paralelos pueden tomar el mismo número (pasó con b046).

## Decisión
- **La BD es la fuente de verdad** del schema. Cada migración aplicada deja
  su **espejo** en `db/proposed/` con prefijo por carril: `bNNN_`
  (backend/dinero) y `mNNN_` (marketplace/viajero), contadores
  independientes. Los espejos son documentación: ahí NO se ejecuta nada.
- Antes de nombrar un espejo: `ls db/proposed/` **y** revisar
  `supabase_migrations.schema_migrations`; si el número está tomado, recorre
  el tuyo.
- El respaldo autoritativo es el **snapshot** `supabase db dump --schema
  ketzal -f supabase/snapshots/ketzal_schema.sql`, regenerado tras cada
  cambio de BD y commiteado (su `git diff` ES el historial de schema). Probó
  su valor: la migración de proyecto 2026-08-26 se hizo desde él.
- Los `database.types.ts` tienen **un solo dueño**; RPCs/columnas nuevos se
  llaman con cast `as never` — nadie más toca ese archivo.
- Funciones compartidas se re-aplican **aditivamente desde el DDL vivo**
  (leerlo antes), conservando las keys/checks de otros carriles.

## Consecuencias
- Rebuild-from-zero garantizado por el snapshot, no por concatenar espejos
  (que son patches, no scripts limpios).
- DDL aplicado por `execute_sql` fuera de `apply_migration` NO queda en el
  historial — prohibido para cambios permanentes (pasó con wa_autosend y se
  reparó).

## Verificación
`git log supabase/snapshots/ketzal_schema.sql` avanza con cada carril de BD;
espejo nuevo por cada entrada nueva en `list_migrations`.

## Fuentes
`db/proposed/README.md`, `supabase/README.md`, `docs/WORKTREES.md`, incidente
b046 (número pisado).
