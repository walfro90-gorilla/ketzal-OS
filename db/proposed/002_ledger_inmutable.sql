-- 002 — Ledger inmutable (huella histórica inborrable).
--
-- CONTEXTO (2026-07-19). Auditoría de `pg_stat_user_tables` encontró que la data
-- de pruebas previa no se borró con DELETE sino con TRUNCATE: `payment_intents`
-- perdió 15 filas con n_tup_del = 0, y bookings/payments/customers/receipts
-- quedaron en cero con muchos más insertados que borrados. Se llevó también
-- `receipt_counters` ⇒ **los folios de recibo reiniciaron en 1**. Con recibos
-- reales emitidos eso es folio duplicado: indefendible en una auditoría.
--
-- La regla de oro #3 del proyecto (ledger append-only; las correcciones son
-- asientos nuevos tipo `refund`, no updates/deletes) vivía sólo en la capa de
-- aplicación. Esto la baja a la BD.
--
-- DECISIÓN DEL FUNDADOR (2026-07-19): todo registro futuro se queda, **incluso
-- los de prueba**, para dejar huella histórica. Por eso el harding testing corre
-- bajo agencias QA dedicadas: nada se borra, y como todo particiona por
-- supplier_id, los números de las agencias reales nacen limpios.
--
-- ALCANCE — qué se congela y qué no:
--   SÍ  payments, receipts, receipt_counters, system_log  (la huella de dinero)
--   NO  bookings  — se actualiza legítimamente (estado, cancelación). Congelarla
--       rompe el flujo. Cancelar ya es un asiento nuevo, no un borrado.
--
-- LÍMITE CONOCIDO: esto no es inmutable contra el owner de la BD — quien pueda
-- hacer DROP TRIGGER puede borrar. Lo que compra: (a) la app y la API no pueden
-- borrar nunca, ni con la service key; (b) un TRUNCATE accidental desde el SQL
-- editor rebota; (c) desactivarlo exige un DROP TRIGGER explícito que aparece en
-- el `git diff` del dump versionado (supabase/snapshots/ketzal_schema.sql).
-- Inmutabilidad real contra el owner requiere el log fuera de esta BD: YAGNI hoy.

create or replace function ketzal.tg_ledger_inmutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'ledger append-only: % sobre % está prohibido. Las correcciones son asientos nuevos (payment tipo refund).',
    tg_op, tg_table_name
    using errcode = 'P0001';
end $$;

-- Statement-level a propósito: BEFORE TRUNCATE sólo existe en esa forma, y
-- TRUNCATE fue justamente lo que borró la historia anterior.
create trigger no_mutar before delete or truncate on ketzal.payments
  for each statement execute function ketzal.tg_ledger_inmutable();
create trigger no_mutar before delete or truncate on ketzal.receipts
  for each statement execute function ketzal.tg_ledger_inmutable();
create trigger no_mutar before delete or truncate on ketzal.receipt_counters
  for each statement execute function ketzal.tg_ledger_inmutable();
create trigger no_mutar before delete or truncate on ketzal.system_log
  for each statement execute function ketzal.tg_ledger_inmutable();

-- Cinturón además de tirantes: que ni siquiera llegue al trigger desde la API.
revoke delete, truncate on ketzal.payments, ketzal.receipts,
  ketzal.receipt_counters, ketzal.system_log from anon, authenticated, service_role;

-- NOTA sobre un efecto de borde deliberado: `payments.user_id` referencia
-- auth.users ON DELETE CASCADE. Con este trigger, borrar una cuenta de auth que
-- haya registrado pagos **falla**. Es el comportamiento correcto bajo la regla
-- nueva (la huella de dinero gana), pero queda escrito aquí para que no
-- sorprenda: si algún día hay que dar de baja un usuario, se desactiva la
-- cuenta (profiles.active = false), no se borra.
--
-- Verificación (debe fallar las 4):
--   delete from ketzal.payments where false;
--   truncate ketzal.payments;
--   delete from ketzal.receipts where false;
--   truncate ketzal.receipt_counters;
