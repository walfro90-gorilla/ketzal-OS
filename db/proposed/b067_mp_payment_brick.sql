-- b067: checkout embebido de Mercado Pago (Payment Brick), sin salir de Ketzal
-- OS. Sin cambios de esquema — solo una RPC nueva. El comprador paga con
-- POST /v1/payments (Checkout API) en vez de /checkout/preferences (Checkout
-- Pro); el split (b053) se preserva vía `application_fee` + el token de la
-- agencia. Esta función expone la public_key con la que el cliente inicializa
-- el Brick para un pedido dado.

create or replace function ketzal.get_booking_checkout_key(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_mc uuid;
  v_key text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select selling_supplier_id, marketplace_customer_id
    into v_supplier, v_mc
    from ketzal.bookings where id = p_booking_id;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;

  select public_key into v_key from ketzal.mp_accounts where supplier_id = v_supplier;
  return jsonb_build_object('public_key', v_key, 'split', v_key is not null);
end
$function$;

revoke all on function ketzal.get_booking_checkout_key(uuid) from public, anon;
grant execute on function ketzal.get_booking_checkout_key(uuid) to authenticated, service_role;
