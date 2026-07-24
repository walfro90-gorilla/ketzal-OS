-- b025 — Refactor de identidad, Fase 1: viajero = profiles(type='viajero')
-- Espejo de la migración aplicada `b025_viajero_profiles` (prod wnujoyzdpdyxblgdtxjw).
--
-- Unifica al comprador B2C en `profiles` y ELIMINA `marketplace_customers`. Prod en
-- balance 0 (0 filas) ⇒ cero migración de datos. Solo 5 funciones tocaban la TABLA;
-- las otras 12 (incl. las 4 del motor de comisiones) solo usan la COLUMNA
-- `bookings.marketplace_customer_id`, que se conserva (= uid del viajero = su profile
-- id). Plan: docs/REFACTOR_IDENTIDAD.md

-- 1. profiles gana `phone` (marketplace_customers lo tenía; name/email ya existen).
alter table ketzal.profiles add column if not exists phone text;

-- 2. ensure_profile: el guard "no crear agente si ya es viajero" pasa a profiles.type.
create or replace function ketzal.ensure_profile()
returns void language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
begin
  insert into ketzal.profiles (id, email, name)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1))
  from auth.users u
  where u.id = auth.uid()
    and not exists (
      select 1 from ketzal.profiles m where m.id = auth.uid() and m.type = 'viajero'
    )
  on conflict (id) do nothing;
end $function$;

-- 3. create_marketplace_order: el comprador ahora es un profile type='viajero'.
create or replace function ketzal.create_marketplace_order(p_service_id uuid, p_travel_date date, p_items jsonb)
returns uuid language plpgsql security definer
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
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_buyer from ketzal.profiles where id = v_uid and type = 'viajero';
  if not found then raise exception 'Solo compradores registrados pueden pedir.'; end if;

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

  -- espejo del comprador como cliente de la agencia dueña, con dedup.
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

-- 4. list_travelers: viajeros desde profiles(type='viajero'). JSON key 'full_name'
--    se conserva (contrato con la app) = profiles.name.
create or replace function ketzal.list_travelers()
returns jsonb language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'full_name',   m.name,
    'email',       m.email,
    'phone',       m.phone,
    'created_at',  m.created_at,
    'num_compras', (select count(*) from ketzal.bookings b
                     where b.marketplace_customer_id = m.id)
  ) order by m.created_at desc), '[]'::jsonb) into v
  from ketzal.profiles m
  where m.type = 'viajero';

  return v;
end $function$;

-- 5. get_service_reviews: autor de la reseña desde profiles (viajero).
create or replace function ketzal.get_service_reviews(p_service_id uuid)
returns jsonb language sql
stable security definer
set search_path to 'ketzal', 'public'
as $function$
  with r as (
    select rt.rating, rt.comment, rt.created_at,
           split_part(coalesce(mc.name, 'Viajero'), ' ', 1) as autor
    from ketzal.ratings rt
    join ketzal.bookings b on b.id = rt.booking_id
    left join ketzal.profiles mc on mc.id = b.marketplace_customer_id and mc.type = 'viajero'
    where rt.kind = 'traveler_to_provider' and b.service_id = p_service_id
  )
  select jsonb_build_object(
    'count', count(*),
    'avg', round(coalesce(avg(rating), 0), 1),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'rating', rating, 'comment', comment, 'autor', autor, 'created_at', created_at)
      order by created_at desc), '[]'::jsonb)
  ) from r;
$function$;

-- 6. alertas_anomalias_dinero: nombre del cliente marketplace desde profiles.
create or replace function ketzal.alertas_anomalias_dinero()
returns jsonb language sql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
  with anom as (
    select sl.ts, sl.event, sl.detail
    from ketzal.system_log sl
    where sl.source in ('mp_confirm','mp_webhook')
      and sl.event in ('sobrepago','pagado_sin_cupo','pago_cancelado')
      and sl.ts > now() - interval '21 days'
  ),
  scoped as (
    select a.ts, a.event,
           (a.detail->>'booking_id')::uuid as booking_id,
           (a.detail->>'amount')::numeric   as amount,
           a.detail->>'mp_payment_id'        as mp_payment_id,
           b.folio,
           coalesce(cu.full_name, mc.name, 'Cliente') as cliente,
           coalesce(sv.name, 'A medida')                   as servicio
    from anom a
    join ketzal.bookings b on b.id = (a.detail->>'booking_id')::uuid
    left join ketzal.customers cu on cu.id = b.customer_id
    left join ketzal.profiles mc on mc.id = b.marketplace_customer_id
    left join ketzal.services sv on sv.id = b.service_id
    where ketzal.is_superadmin()
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
  )
  select jsonb_build_object(
    'total',     (select count(*) from scoped),
    'sobrepago', (select count(*) from scoped where event = 'sobrepago'),
    'sin_cupo',  (select count(*) from scoped where event = 'pagado_sin_cupo'),
    'cancelado', (select count(*) from scoped where event = 'pago_cancelado'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', event, 'booking_id', booking_id, 'amount', amount,
        'mp_payment_id', mp_payment_id, 'ts', ts, 'folio', folio,
        'cliente', cliente, 'servicio', servicio) order by ts desc)
      from scoped), '[]'::jsonb)
  );
$function$;

-- 7. register_traveler: alta/edición del propio viajero con sesión (authenticated
--    no puede escribir profiles tras b017 ⇒ va por DEFINER). No convierte a un
--    agente existente en viajero (guard on-conflict where type='viajero').
create or replace function ketzal.register_traveler(p_full_name text, p_phone text)
returns void language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into ketzal.profiles (id, email, name, phone, type, active)
  values (v_uid, v_email, nullif(btrim(p_full_name),''), nullif(btrim(p_phone),''), 'viajero', true)
  on conflict (id) do update
    set name  = excluded.name,
        phone = excluded.phone,
        active = true
    where ketzal.profiles.type = 'viajero';
end $function$;
revoke all on function ketzal.register_traveler(text,text) from public, anon;
grant execute on function ketzal.register_traveler(text,text) to authenticated, service_role;

-- 8. Re-apuntar las 3 FKs de la columna al nuevo hogar profiles(id), luego drop.
alter table ketzal.customers        drop constraint customers_marketplace_customer_id_fkey;
alter table ketzal.bookings         drop constraint bookings_marketplace_customer_id_fkey;
alter table ketzal.payment_intents  drop constraint payment_intents_marketplace_customer_id_fkey;

alter table ketzal.customers add constraint customers_marketplace_customer_id_fkey
  foreign key (marketplace_customer_id) references ketzal.profiles(id);
alter table ketzal.bookings add constraint bookings_marketplace_customer_id_fkey
  foreign key (marketplace_customer_id) references ketzal.profiles(id);
alter table ketzal.payment_intents add constraint payment_intents_marketplace_customer_id_fkey
  foreign key (marketplace_customer_id) references ketzal.profiles(id);

-- 9. Adiós marketplace_customers (0 filas; ya nada la referencia).
drop table ketzal.marketplace_customers;
