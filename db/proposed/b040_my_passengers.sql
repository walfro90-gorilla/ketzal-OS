-- b040 — El comprador captura a sus acompañantes (pasajeros) tras el primer pago.
-- Espejo de la migración aplicada `b040_my_passengers`.
--
-- Reusa `ketzal.booking_passengers` (F3): misma tabla que captura el agente en
-- /ventas y que alimenta el manifiesto de salidas — lo que el viajero capture
-- le aparece al agente gratis (y viceversa). El viajero NO tiene RLS sobre
-- bookings/booking_passengers (tablas de agencia) ⇒ RPCs DEFINER con guard de
-- propiedad (marketplace_customer_id = auth.uid()).
--
-- Reglas: solo con la compra apartada/pagada (reserved/confirmed/paid = ya dio
-- el primer pago; draft no captura), tope = num_pax de la venta, nombre
-- obligatorio (dato mínimo para viajar), tipo y documento opcionales.

create or replace function ketzal.list_my_passengers(p_booking_id uuid)
 returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from ketzal.bookings b
    where b.id = p_booking_id and b.marketplace_customer_id = v_uid
  ) then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
    from (
      select bp.id, bp.full_name, bp.passenger_type, bp.doc_id, bp.created_at
      from ketzal.booking_passengers bp
      where bp.booking_id = p_booking_id
    ) x
  );
end $function$;

revoke all on function ketzal.list_my_passengers(uuid) from public, anon;
grant execute on function ketzal.list_my_passengers(uuid) to authenticated, service_role;

create or replace function ketzal.add_my_passenger(
  p_booking_id uuid, p_full_name text, p_type text default null, p_doc text default null
) returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_bstatus ketzal.booking_status; v_num_pax int; v_actuales int;
  v_name text; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select status, num_pax into v_bstatus, v_num_pax
  from ketzal.bookings
  where id = p_booking_id and marketplace_customer_id = v_uid;
  if not found then raise exception 'Pedido no encontrado o sin acceso'; end if;
  if v_bstatus not in ('reserved','confirmed','paid') then
    raise exception 'Podrás capturar a tus acompañantes después de tu primer pago.';
  end if;

  v_name := nullif(left(btrim(coalesce(p_full_name,'')), 120), '');
  if v_name is null then raise exception 'Escribe el nombre completo.'; end if;

  select count(*) into v_actuales from ketzal.booking_passengers where booking_id = p_booking_id;
  if v_actuales >= coalesce(v_num_pax, 0) then
    raise exception 'Ya capturaste a los % viajeros de tu compra.', v_num_pax;
  end if;

  insert into ketzal.booking_passengers(booking_id, full_name, passenger_type, doc_id)
  values (p_booking_id, v_name,
          nullif(left(btrim(coalesce(p_type,'')), 40), ''),
          nullif(left(btrim(coalesce(p_doc,'')), 60), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end $function$;

revoke all on function ketzal.add_my_passenger(uuid, text, text, text) from public, anon;
grant execute on function ketzal.add_my_passenger(uuid, text, text, text) to authenticated, service_role;

create or replace function ketzal.remove_my_passenger(p_passenger_id uuid)
 returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from ketzal.booking_passengers bp
  using ketzal.bookings b
  where bp.id = p_passenger_id
    and b.id = bp.booking_id
    and b.marketplace_customer_id = v_uid
    and b.status <> 'cancelled';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Pasajero no encontrado o sin acceso'; end if;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function ketzal.remove_my_passenger(uuid) from public, anon;
grant execute on function ketzal.remove_my_passenger(uuid) to authenticated, service_role;
