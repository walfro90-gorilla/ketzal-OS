-- b041 — Selección de asientos en layout digital (autobús/sprinter/van/avión).
-- Espejo de la migración aplicada `b041_seat_map`.
--
-- Diseño (acordado con el fundador):
--  · La FORMA del layout la da `services.transport_type` (preset por tipo en la
--    app); el TOTAL de asientos = `max_capacity` de la salida (sin campo nuevo
--    que pueda divergir del cupo). Ocupación por (service_id, travel_date) —
--    mismas llaves que el cupo y el manifiesto (F3); reventas incluidas.
--  · Asiento amarrado a un viajero registrado (booking_passengers, b040):
--    "Asiento 12 — Ana López". Quitar al pasajero libera el asiento (CASCADE).
--  · Se elige TRAS el primer pago (reserved/confirmed/paid) — draft no aparta.
--  · Anti-carrera: unique(service_id, travel_date, seat_number) — dos personas
--    al mismo asiento: una gana, la otra recibe error amigable (regla de oro #5).
--  · Un solo camino de escritura para comprador Y staff: RPCs DEFINER con guard
--    dual; la tabla queda deny-all para authenticated (sin grants directos).

alter table ketzal.services add column if not exists transport_type text;
alter table ketzal.services drop constraint if exists services_transport_type_chk;
alter table ketzal.services add constraint services_transport_type_chk
  check (transport_type is null or transport_type in ('autobus','sprinter','van','avion'));

create table if not exists ketzal.seat_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references ketzal.bookings(id) on delete cascade,
  passenger_id uuid not null references ketzal.booking_passengers(id) on delete cascade,
  service_id uuid not null references ketzal.services(id) on delete cascade,
  travel_date date not null,
  seat_number int not null check (seat_number >= 1),
  created_at timestamptz not null default now(),
  unique (passenger_id),
  unique (service_id, travel_date, seat_number)
);

alter table ketzal.seat_assignments enable row level security;
revoke all on ketzal.seat_assignments from authenticated, anon;

-- Guard dual: ¿el caller puede operar esta venta? Comprador dueño, staff de la
-- agencia (vendedora o dueña del servicio), quien la vendió, o superadmin.
create or replace function ketzal.puede_operar_booking(p_booking ketzal.bookings)
 returns boolean
 language sql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
  -- coalesce(false): para un caller sin relación la comparación contra
  -- supplier null da NULL y "if not null" no dispara — cazado por hard-test.
  select coalesce(
    p_booking.marketplace_customer_id = auth.uid()
    or ketzal.is_superadmin()
    or (ketzal.is_active() and (
          p_booking.selling_supplier_id = ketzal.my_supplier_id()
       or p_booking.owner_supplier_id  = ketzal.my_supplier_id()
       or p_booking.sold_by = auth.uid())), false);
$function$;

revoke all on function ketzal.puede_operar_booking(ketzal.bookings) from public, anon, authenticated;

-- Mapa de asientos del pedido: forma + total + ocupados (todo el camión, sin
-- PII) + los asientos de ESTA venta (passenger_id ↔ seat).
create or replace function ketzal.seat_map_for_booking(p_booking_id uuid)
 returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_tipo text; v_total int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_b from ketzal.bookings where id = p_booking_id;
  if not found or not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;

  select s.transport_type into v_tipo from ketzal.services s where s.id = v_b.service_id;
  if v_tipo is null or v_b.travel_date is null then
    return jsonb_build_object('enabled', false);
  end if;
  select d.max_capacity into v_total
  from ketzal.service_departures d
  where d.service_id = v_b.service_id and d.departs_on = v_b.travel_date;
  if v_total is null then return jsonb_build_object('enabled', false); end if;

  return jsonb_build_object(
    'enabled', true,
    'transport_type', v_tipo,
    'total', v_total,
    'occupied', coalesce((
      select jsonb_agg(sa.seat_number)
      from ketzal.seat_assignments sa
      join ketzal.bookings b on b.id = sa.booking_id
      where sa.service_id = v_b.service_id and sa.travel_date = v_b.travel_date
        and b.status <> 'cancelled'
    ), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('passenger_id', sa.passenger_id, 'seat', sa.seat_number))
      from ketzal.seat_assignments sa where sa.booking_id = v_b.id
    ), '[]'::jsonb)
  );
end $function$;

revoke all on function ketzal.seat_map_for_booking(uuid) from public, anon;
grant execute on function ketzal.seat_map_for_booking(uuid) to authenticated, service_role;

-- Asignar/cambiar el asiento de un pasajero. Upsert por pasajero; la carrera
-- por el mismo asiento la decide el unique (error amigable al perdedor).
create or replace function ketzal.assign_seat(p_passenger_id uuid, p_seat int)
 returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking_id uuid; v_tipo text; v_total int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select bp.booking_id into v_booking_id
  from ketzal.booking_passengers bp where bp.id = p_passenger_id;
  if not found then raise exception 'Pasajero no encontrado'; end if;
  select * into v_b from ketzal.bookings where id = v_booking_id;
  if not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pasajero no encontrado o sin acceso';
  end if;
  if v_b.status not in ('reserved','confirmed','paid') then
    raise exception 'Los asientos se eligen después del primer pago.';
  end if;

  select s.transport_type into v_tipo from ketzal.services s where s.id = v_b.service_id;
  if v_tipo is null then raise exception 'Este viaje no tiene mapa de asientos.'; end if;
  if v_b.travel_date is null then raise exception 'Este viaje no tiene fecha de salida.'; end if;
  select d.max_capacity into v_total
  from ketzal.service_departures d
  where d.service_id = v_b.service_id and d.departs_on = v_b.travel_date;
  if v_total is null then raise exception 'La salida de este viaje no existe.'; end if;
  if p_seat < 1 or p_seat > v_total then
    raise exception 'Asiento fuera de rango (1–%).', v_total;
  end if;

  begin
    insert into ketzal.seat_assignments(booking_id, passenger_id, service_id, travel_date, seat_number)
    values (v_b.id, p_passenger_id, v_b.service_id, v_b.travel_date, p_seat)
    on conflict (passenger_id)
    do update set seat_number = excluded.seat_number, created_at = now();
  exception when unique_violation then
    raise exception 'Ese asiento ya está ocupado. Elige otro.';
  end;

  return jsonb_build_object('ok', true, 'seat', p_seat);
end $function$;

revoke all on function ketzal.assign_seat(uuid, int) from public, anon;
grant execute on function ketzal.assign_seat(uuid, int) to authenticated, service_role;

-- Liberar el asiento de un pasajero (mismo guard dual).
create or replace function ketzal.release_seat(p_passenger_id uuid)
 returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select bp.booking_id into v_booking_id
  from ketzal.booking_passengers bp where bp.id = p_passenger_id;
  if not found then raise exception 'Pasajero no encontrado'; end if;
  select * into v_b from ketzal.bookings where id = v_booking_id;
  if not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pasajero no encontrado o sin acceso';
  end if;

  delete from ketzal.seat_assignments where passenger_id = p_passenger_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'released', v_n > 0);
end $function$;

revoke all on function ketzal.release_seat(uuid) from public, anon;
grant execute on function ketzal.release_seat(uuid) to authenticated, service_role;
