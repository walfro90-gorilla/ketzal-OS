-- b068: el viajero puede eliminar su propio pedido si sigue 'draft' y NO tiene
-- ningún rastro de dinero (ni payments ni payment_intents) — así "Mis compras"
-- no acumula pedidos abandonados/de prueba. Un pedido con cualquier pago o
-- intento de pago NUNCA se borra (ledger append-only) — para ese caso el
-- camino es cancelar (hoy solo desde el lado agente, cancel_booking_v2).
create or replace function ketzal.delete_my_draft_order(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mc uuid;
  v_status ketzal.booking_status;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select marketplace_customer_id, status into v_mc, v_status
    from ketzal.bookings where id = p_booking_id for update;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo puedes eliminar pedidos que sigan pendientes de pago.';
  end if;

  if exists (select 1 from ketzal.payments where booking_id = p_booking_id) then
    raise exception 'Este pedido ya tiene un pago registrado, no se puede eliminar.';
  end if;

  if exists (select 1 from ketzal.payment_intents where booking_id = p_booking_id) then
    raise exception 'Este pedido tiene un intento de pago en curso, no se puede eliminar.';
  end if;

  delete from ketzal.bookings where id = p_booking_id;
end
$function$;

revoke all on function ketzal.delete_my_draft_order(uuid) from public, anon;
grant execute on function ketzal.delete_my_draft_order(uuid) to authenticated;
