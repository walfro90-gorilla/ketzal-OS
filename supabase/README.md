# Backend de base de datos (schema `ketzal`)

> **La fuente de verdad de la BD es Supabase** (proyecto Gorilla-Labs,
> ref `wnujoyzdpdyxblgdtxjw`, schema `ketzal`). Las migraciones históricas se
> aplicaron con la herramienta `apply_migration` de Supabase. Esta carpeta
> cierra el riesgo #1 del FODA: versionar el backend para **recuperación,
> historial y auditoría**.

## Qué hay aquí

### `snapshots/ketzal_schema.sql` — respaldo fiel y completo
Dump `pg_dump` del schema `ketzal` completo: tablas, columnas, tipos/enums,
índices, constraints, **funciones/RPCs con su cuerpo**, **políticas RLS**,
triggers y grants. Es el respaldo autoritativo — si Supabase se perdiera, con
este archivo se recrea el backend lógico. Generado con la Supabase CLI (abajo).

## Cómo re-generar el dump (workflow correcto)

```bash
# CLI ya instalada y proyecto ya linkeado (una sola vez):
#   npm i -g supabase && supabase login && supabase link --project-ref wnujoyzdpdyxblgdtxjw

supabase db dump --schema ketzal -f supabase/snapshots/ketzal_schema.sql
git diff supabase/snapshots/ketzal_schema.sql   # <- muestra el drift del schema
```

Córrelo **después de cada cambio de BD** (o en CI/cron) y commitéalo. El
`git diff` del dump es el historial de cambios de schema.

## Por qué NO usamos `supabase db pull` / `db push`

El proyecto Supabase es **compartido con otras apps** (schemas `tiendas`,
war-room/crm, etc.). Su tabla de historial `supabase_migrations.schema_migrations`
es un log lineal **global**: 89 migraciones, de las cuales solo 33 son de Ketzal
(el resto de las apps hermanas). Por eso:

- `supabase db pull` falla con `LegacyDbPullMigrationConflictError` (historial
  remoto sin archivos locales que lo respalden), y "arreglarlo" con
  `migration repair` reescribiría bookkeeping de las otras apps.
- `supabase db push` nunca quedaría limpio: vería las 56 migraciones ajenas
  como "remoto adelantado".

El `db dump` esquiva todo eso: no toca el historial, solo fotografía el schema
`ketzal`. Es el artefacto de respaldo correcto para este proyecto multi-app.

## Notas
- Los tipos de TypeScript viven aparte en `src/lib/db/database.types.ts`
  (mantenidos a mano). No se generan desde aquí.
- Los cambios de schema se siguen aplicando con `apply_migration` (MCP de
  Supabase); este dump es el respaldo versionado, no el mecanismo de despliegue.
