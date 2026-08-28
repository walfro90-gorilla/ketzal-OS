# ADR-0006 — Ledger append-only con enforcement EN BD; tablas de dinero = RPC-only-write

- Estado: aceptada · Fecha: 2026-07-19 (enforcement BD) / 2026-08-04 (b051 RPC-only) · Sustituye: —
- Alcance: `payments`, `receipts`, `receipt_counters`, `doc_counters`, `expenses`, `credits`, `commission_lines`, `ledger_entries`, `system_log`, `user_events` y TODA tabla de dinero futura

## Contexto
Tres familias de bug reales pegaron en este repo:
1. **GRANT de tabla + policy sin restricción de columnas = escritura
   arbitraria por PostgREST**, aunque la app "nunca lo haga": cualquier
   autenticado podía `PATCH /rest/v1/payments` y subir `amount_mxn` (venta
   "pagada" sin dinero) o borrar `credit_id` (b051). Antes, lo mismo permitía
   auto-promoverse a superadmin vía `profiles` (b017).
2. Guard `OR` sin `coalesce` que evalúa NULL y deja pasar (b041).
3. Saldo derivado de columna escribible (ver ADR-0005).

## Decisión
- **Append-only**: cancelaciones/correcciones son asientos nuevos (`refund`,
  contra-asiento de gasto, reverso de comisión), NUNCA update/delete.
  `bookings` queda fuera a propósito (se actualiza legítimamente).
- El enforcement vive **en la BD, no en la app**: trigger `no_mutar` (BEFORE
  DELETE OR TRUNCATE) + `REVOKE DELETE,TRUNCATE` (y en payments también
  UPDATE) a `authenticated`/`anon`.
- **Toda escritura de dinero va por RPC** con guard (`register_payment`,
  `refund_payment*`, `redeem_credit`, `confirm_online_payment`,
  `create_expense`/`reverse_expense`, `ledger_post`) o `service_role`.
- **Toda tabla de dinero nueva nace RPC-only-write**: RLS de lectura scoped +
  cero GRANT de escritura al cliente. Patrón de referencia: `profiles` (b017),
  `sales_goals`, `agency_invitations`, `credits` (b051), `ledger_entries` (b052).

## Consecuencias
- Corregir un error cuesta un contra-asiento — ese es el precio de que nadie
  pueda reescribir la historia del dinero.
- Cargas masivas (restore, migración) requieren bajar/re-armar los guards en
  un DO block atómico (patrón de los resets 2026-08-08 / 2026-08-19).
- Un agente en bucle no puede "limpiar" sus errores: por eso el MCP exige
  `confirmar: true` y trae cupo de escrituras (ADR-0013).

## Verificación
`DELETE FROM ketzal.payments` como authenticated debe fallar con "ledger
append-only"; advisors 0 ERROR; checklist de cierre en la memoria
`seguridad-rls-postgrest`.

## Fuentes
Regla de oro #3 completa, `db/proposed/002_ledger_inmutable.sql`,
`b017_profiles_lockdown`, `b051_credits_hardening`, hard-tests SQL en
`supabase/tests/`.
