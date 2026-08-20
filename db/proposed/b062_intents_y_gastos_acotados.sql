-- b062 — el comprador deja de poder tocar su propio intent, y el gasto exige agencia.
-- Migración aplicada: `b062_intents_y_gastos_acotados` (2026-08-19).
--
-- ══ HUECO 1: payment_intents ══
-- `payment_intents_upd` era `is_superadmin() OR created_by = auth.uid() OR
-- supplier_id = my_supplier_id()`. La rama `created_by` deja al COMPRADOR editar
-- su propio intent. Comprobado en vivo con la cuenta de viajero:
--   * `status = 'approved'` .... 1 fila. El intent desaparece de
--     `list_pending_spei`, así que el admin ya no lo ve para revisar el
--     comprobante, y `resolve_spei_payment` lo rechaza ("ya resuelta"). El
--     comprador puede exhibir un pago "aprobado" que nadie revisó.
--   * `amount = 999999` ....... 1 fila. Y esto SÍ mueve dinero:
--     `resolve_spei_payment` lee el ROW del intent para crear el abono, así que
--     subir el monto mientras está `pending` inyecta ese monto al aprobarse.
--
-- Arreglo: la escritura exige ser staff DE ESA VENTA. No rompe nada:
--   * `ventas/[id]/actions.ts:199` (guardar `mp_preference_id`) lo hace un agente
--     de la agencia con su sesión ⇒ es staff, sigue pasando (verificado).
--   * `comprar/actions.ts:311` (marcar `split`) usa service_role ⇒ no pasa por RLS.
--   * `submit_spei_payment`, `resolve_spei_payment`, `reopen_spei_payment` y
--     `confirm_online_payment` son SECURITY DEFINER ⇒ tampoco pasan por RLS.
--
-- ══ HUECO 2: expenses ══
-- `expenses_scoped_ins` aceptaba `supplier_id IS NULL`, que cualquier autenticado
-- satisface. Un viajero insertó un gasto. Daño acotado (los resúmenes filtran por
-- agencia), pero `expenses` es append-only con trigger `no_mutar`: la basura que
-- entre ahí NO SE PUEDE BORRAR nunca.
--
-- Arreglo: exigir agencia real, con salida para el superadmin, que no tiene
-- agencia propia y sí registra gastos de plataforma.
--
-- ══ HARD-TEST (rollback) ══
--   ATAQUE (viajero):  auto-aprobar SPEI 0 filas · inflar monto 0 filas ·
--                      insertar gasto BLOQUEADO
--   LEGÍTIMO (admin):  guardar mp_preference_id OK · create_expense OK ·
--                      resolve_spei_payment OK (abono creado)
--                      monto final del intent = 5000, intacto

drop policy payment_intents_upd on ketzal.payment_intents;
create policy payment_intents_upd on ketzal.payment_intents
for update to authenticated
using (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.bookings b
     where b.id = payment_intents.booking_id
       and ketzal.es_staff_de_booking(b)
  )
);

drop policy expenses_scoped_ins on ketzal.expenses;
create policy expenses_scoped_ins on ketzal.expenses
for insert to authenticated
with check (
  ketzal.is_active()
  and created_by = auth.uid()
  and (
    ketzal.is_superadmin()
    or (supplier_id is not null and supplier_id = ketzal.my_supplier_id())
  )
);
