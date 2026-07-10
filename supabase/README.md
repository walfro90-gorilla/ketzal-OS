# Backend de base de datos (schema `ketzal`)

> **La fuente de verdad de la BD es Supabase** (proyecto Gorilla-Labs,
> ref `wnujoyzdpdyxblgdtxjw`, schema `ketzal`). Las migraciones históricas se
> aplicaron con la herramienta `apply_migration` de Supabase y **no** vivían en
> git. Esta carpeta cierra ese hueco (riesgo #1 del FODA después de MP):
> versionar el backend de la BD para **recuperación, historial y auditoría**.

## Qué hay aquí

### `snapshots/` — respaldo versionado (generado 2026-07-09)
- **`ketzal_functions.sql`** — las **39 funciones/RPCs** del schema (toda la
  lógica de dinero y seguridad: `create_booking_with_items`, `register_payment`,
  `emit_receipt`, `cancel_booking`, `generate_payment_plan`,
  `confirm_online_payment`, `get_quote_by_token`, `cobranza`, helpers de RLS
  `is_superadmin`/`my_supplier_id`/`is_active`, etc.). Extraído con
  `pg_get_functiondef`.
- **`ketzal_policies.sql`** — las **56 políticas RLS** (aislamiento multi-agencia
  = riesgo #1 del negocio). Reconstruido desde `pg_policies`.

Los snapshots son un respaldo, **no** el mecanismo de despliegue. Si Supabase
se perdiera, con estos archivos se recupera casi todo el backend lógico.

## Cómo obtener un dump FIEL y COMPLETO (recomendado, going forward)

Los snapshots de arriba cubren funciones y policies. Para versionar **todo con
fidelidad** (tablas, columnas, tipos/enums, índices, grants, triggers,
constraints) usa la **Supabase CLI** — es la forma correcta a partir de ahora:

```bash
# 1. Instalar la CLI (una vez): https://supabase.com/docs/guides/cli
brew install supabase/tap/supabase        # macOS
# o: npm i -g supabase

# 2. Login + link al proyecto (una vez)
supabase login
supabase link --project-ref wnujoyzdpdyxblgdtxjw

# 3. Bajar el schema `ketzal` como migración versionada
supabase db pull --schema ketzal
# → genera supabase/migrations/<timestamp>_remote_schema.sql (commitéalo)
```

A partir de ahí, cada cambio de BD debería ir como archivo en
`supabase/migrations/` y aplicarse con `supabase db push`, en vez de sólo
`apply_migration`. Así la BD queda con historial en git como el resto del código.

## Notas
- Los tipos de TypeScript viven aparte en `src/lib/db/database.types.ts`
  (mantenidos a mano). No se generan desde aquí.
- El schema `ketzal` es compartido en el proyecto Supabase con otros productos
  (schemas `tiendas`, etc.); por eso se filtra `--schema ketzal`.
