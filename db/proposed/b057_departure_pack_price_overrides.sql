-- b057: precios especiales por paquete en una salida específica (más allá del %
-- uniforme de b045). Ej.: promo de fin de año donde cuádruple/triple/doble suben
-- montos distintos, no un mismo %. Additive: coexiste con price_pct, no lo
-- reemplaza — la mayoría de salidas sigue usando solo el % uniforme.

create or replace function ketzal.valid_pack_price_overrides(v jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select v is null or (
    jsonb_typeof(v) = 'object'
    and not exists (
      select 1 from jsonb_each(v) e(k, val)
      where k not in ('sencilla','doble','triple','cuadruple')
         or jsonb_typeof(val) <> 'number'
         or (val)::text::numeric <= 0
    )
  );
$$;

grant execute on function ketzal.valid_pack_price_overrides(jsonb) to authenticated, service_role;

alter table ketzal.service_departures
  add column pack_price_overrides jsonb;

alter table ketzal.service_departures
  add constraint service_departures_pack_price_overrides_chk
  check (ketzal.valid_pack_price_overrides(pack_price_overrides));

-- Resolución de precio por pack: override[pack_key] si existe, si no
-- price*(1+price_pct/100) como hasta hoy. Additive en las dos funciones que ya
-- calculan precio por salida (DDL vivo leído antes de re-aplicar).

create or replace function ketzal.create_marketplace_order(p_service_id uuid, p_travel_date date, p_items jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
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
  v_pct numeric := 0;
  v_overrides jsonb;
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

  -- b045: ajuste de temporada de la salida elegida. b057: además su override
  -- por pack, si lo tiene (se resuelve más abajo, override manda sobre el %).
  v_has_dep := exists (select 1 from ketzal.service_departures d where d.service_id = p_service_id);
  if v_has_dep then
    if p_travel_date is null then raise exception 'Selecciona la fecha de salida.'; end if;
    select d.price_pct, d.pack_price_overrides into v_pct, v_overrides
    from ketzal.service_departures d
    where d.service_id = p_service_id and d.departs_on = p_travel_date;
    if not found then
      raise exception 'Sin cupo para la salida seleccionada.';
    end if;
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Cantidad inválida.'; end if;
    select round(coalesce(
             (v_overrides->>(it->>'pack_key'))::numeric,
             (p->>'price')::numeric * (1 + v_pct / 100)
           ), 2) into v_unit
      from jsonb_array_elements(coalesce(v_svc.packs, '[]'::jsonb)) p
      where p->>'key' = it->>'pack_key'
      limit 1;
    if v_unit is null then raise exception 'Opción inválida: %', coalesce(it->>'pack_key','(vacío)'); end if;
    v_subtotal := v_subtotal + round(v_qty * v_unit, 2);
    v_num_pax := v_num_pax + v_qty;
  end loop;
  v_subtotal := round(v_subtotal, 2);

  if v_has_dep then
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
    select round(coalesce(
             (v_overrides->>(li->>'pack_key'))::numeric,
             (p->>'price')::numeric * (1 + v_pct / 100)
           ), 2) as price
    from jsonb_array_elements(v_svc.packs) p
    where p->>'key' = li->>'pack_key'
    limit 1
  ) pk on true;

  return v_booking;
end $function$;

create or replace function ketzal.get_public_service(p_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'ketzal', 'public'
as $function$
  select to_jsonb(t) from (
    select s.id, s.name, s.description, s.price, s.service_type, s.service_category,
           s.location, s.city_from, s.state_from, s.city_to, s.state_to,
           s.size_tour, s.max_capacity, s.current_bookings,
           s.images, s.yt_link, s.includes, s.excludes, s.faqs, s.itinerary,
           s.packs, s.add_ons, s.dates,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date
               and d.seats_taken < d.max_capacity
           ), '[]'::jsonb) as departures,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date - interval '180 days'
           ), '[]'::jsonb) as all_departures,
           jsonb_build_object(
             'id', sup.id,
             'name', sup.name, 'logo', sup.img_logo,
             'email', sup.contact_email, 'phone', sup.phone_number
           ) as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    where s.id = p_id and s.published
  ) t;
$function$;
