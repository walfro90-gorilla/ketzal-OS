-- b033 — Comprar en el marketplace = capacidad BASE de todo usuario de Ketzal.
-- Espejo de la migración aplicada `b033_marketplace_order_any_user`.
--
-- Regla del fundador: todos son usuarios de Ketzal; el `type` (viajero/agente/
-- embajador/proveedor) y el `role` solo definen su superficie y permisos elevados,
-- NO le quitan la posibilidad de comprar. Antes create_marketplace_order exigía
-- type='viajero' ⇒ un superadmin/agente no podía ni probar una compra. Ahora basta
-- tener un profile (cualquier tipo). El resto del flujo (pago, ver pedido) ya
-- filtra por marketplace_customer_id=uid, no por tipo, así que solo cambia este RPC.
-- Hard-test rollback: superadmin crea pedido draft (10999/1pax). Advisors 0 ERROR
-- (replace de función existente, sin objeto nuevo).
--
-- ÚNICO cambio vs la versión previa: el guard del comprador
--   antes: select * into v_buyer from ketzal.profiles where id=v_uid and type='viajero';
--          if not found then raise 'Solo compradores registrados pueden pedir.';
--   ahora: select * into v_buyer from ketzal.profiles where id=v_uid;
--          if not found then raise 'Necesitas una cuenta de Ketzal para pedir.';
create or replace function ketzal.create_marketplace_order(p_service_id uuid, p_travel_date date, p_items jsonb)
 returns uuid language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_buyer ketzal.profiles%rowtype;
  v_svc ketzal.services%rowtype;
  v_owner uuid;
  v_customer uuid;
  v_subtotal numeric(12,2) := 0;
  v_num_pax int := 0;
  v_booking uuid;
  it jsonb; v_qty int; v_unit numeric(12,2);
  v_has_dep boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  -- Cualquier usuario de Ketzal puede comprar (viajero, agente, embajador, admin,
  -- superadmin): comprar es capacidad base; el type solo define su superficie.
  select * into v_buyer from ketzal.profiles where id = v_uid;
  if not found then raise exception 'Necesitas una cuenta de Ketzal para pedir.'; end if;

  select * into v_svc from ketzal.services where id = p_service_id and published;
  if not found then raise exception 'Servicio no disponible.'; end if;
  v_owner := v_svc.supplier_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecciona al menos una opción.';
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Cantidad inválida.'; end if;
    select (p->>'price')::numeric into v_unit
      from jsonb_array_elements(coalesce(v_svc.packs, '[]'::jsonb)) p
      where p->>'key' = it->>'pack_key'
      limit 1;
    if v_unit is null then raise exception 'Opción inválida: %', coalesce(it->>'pack_key','(vacío)'); end if;
    v_subtotal := v_subtotal + round(v_qty * v_unit, 2);
    v_num_pax := v_num_pax + v_qty;
  end loop;
  v_subtotal := round(v_subtotal, 2);

  v_has_dep := exists (select 1 from ketzal.service_departures d where d.service_id = p_service_id);
  if v_has_dep then
    if p_travel_date is null then raise exception 'Selecciona la fecha de salida.'; end if;
    if not exists (
      select 1 from ketzal.service_departures d
      where d.service_id = p_service_id
        and d.departs_on = p_travel_date
        and d.seats_taken + v_num_pax <= d.max_capacity
    ) then
      raise exception 'Sin cupo para la salida seleccionada.';
    end if;
  end if;

  select id into v_customer from ketzal.customers
    where supplier_id = v_owner and marketplace_customer_id = v_uid
    limit 1;
  if v_customer is null then
    insert into ketzal.customers(supplier_id, full_name, phone, email, created_by, marketplace_customer_id)
    values (v_owner, v_buyer.name, v_buyer.phone, v_buyer.email, null, v_uid)
    returning id into v_customer;
  end if;

  insert into ketzal.bookings(
    selling_supplier_id, owner_supplier_id, customer_id, marketplace_customer_id,
    service_id, sold_by, travel_date, num_pax, subtotal, discount, total, currency, status)
  values (
    v_owner, v_owner, v_customer, v_uid,
    p_service_id, null, case when v_has_dep then p_travel_date else null end,
    v_num_pax, v_subtotal, 0, v_subtotal, 'MXN', 'draft')
  returning id into v_booking;

  insert into ketzal.booking_items(booking_id, item_type, passenger_type, description, qty, unit_price, line_total)
  select v_booking, 'passenger', li->>'pack_key', li->>'label', (li->>'qty')::int,
         pk.price, round((li->>'qty')::int * pk.price, 2)
  from jsonb_array_elements(p_items) li
  join lateral (
    select (p->>'price')::numeric as price
    from jsonb_array_elements(v_svc.packs) p
    where p->>'key' = li->>'pack_key'
    limit 1
  ) pk on true;

  return v_booking;
end $function$;
