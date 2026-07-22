# db/proposed — espejos de migraciones

Estos archivos son **espejo / documentación** de las migraciones aplicadas a
Supabase. La **fuente real es la BD** (vía `apply_migration`; el historial vive
en `list_migrations`). Aquí NO se ejecuta nada; sirven para revisar el DDL desde
el repo.

## Numeración (convención multi-agente)

Dos carriles escriben aquí en paralelo (ver `docs/WORKTREES.md`). Para no chocar
en la numeración, **cada carril usa su propio prefijo y su propio contador**:

| Prefijo | Carril | Dueño típico | Ejemplos de dominio |
|---|---|---|---|
| `bNNN_` | **Backend / back-office / dinero** | Opus | ventas, recibos, gastos/CxP, clawbot, divisas, folios, pasajeros/salidas, vouchers, metas |
| `mNNN_` | **Marketplace / viajero (B2C)** | Fable | catálogo público, órdenes B2C, ratings/reseñas, WhatsApp, perfil del viajero |

- **`NNN` es la secuencia propia del carril**, no compartida. Como los prefijos
  difieren, dos agentes nunca producen el mismo nombre aunque coincidan en el
  número.
- El **nombre del archivo calca el de la migración aplicada** (`apply_migration`
  → `list_migrations`), p. ej. `b017_folio_devoluciones.sql`.
- Cada quien commitea **solo sus propios espejos** (`git add` explícito por
  nombre; nunca `git add -A`).

### Próximo número

Ambos carriles vienen en **016**. El siguiente espejo nuevo es **`b017_`**
(backend) y **`m017_`** (marketplace).

### Legacy (grandfathered — NO renumerar)

Los archivos `001_`–`016_` (sin prefijo) son previos a esta convención. Varios
números están **duplicados** entre carriles (011, 013, 014, 015, 016) porque se
numeraron en paralelo antes de esta regla:

| # | Backend (`b`) | Marketplace (`m`) |
|---|---|---|
| 011 | `011_pasajeros_salidas.sql` | `011_get_my_trip.sql` |
| 013 | `013_sales_goals.sql` | `013_emit_my_voucher.sql` |
| 014 | `014_currency_usd.sql` | `014_orders_next_due_date.sql` |
| 015 | `015_clawbot_reglas_v2.sql` | `015_orders_ratings.sql` |
| 016 | `016_public_doc_currency.sql` | `016_wa_autosend.sql` |

Se dejan **como están**: sus nombres están referenciados en commits, `CLAUDE.md`
y `docs/PLAN_COMPETIDOR.md`. La convención `b`/`m` aplica **de aquí en adelante**.
