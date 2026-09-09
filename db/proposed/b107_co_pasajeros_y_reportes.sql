-- b107 — Fase 2b del perfil social: quiénes van en mi viaje + reportar/ocultar.
-- Un eje de visibilidad NUEVO (no es tenancy por supplier_id): un viajero ve el
-- perfil social de OTRO viajero sólo si comparten salida (service+fecha, sin FK),
-- ambos con pedido activo, y el otro prendió `is_public`. Cero PII: la proyección
-- jamás devuelve email, teléfono ni nombre completo. Ver ADR-0063.

-- Reportes: (quien reporta, reportado) único. Reportar también OCULTA al reportado
-- para quien reporta (efecto inmediato). El admin los revisa (list_profile_reports).
create table if not exists ketzal.profile_reports (
  reporter_id uuid not null references ketzal.profiles(id) on delete cascade,
  reported_id uuid not null references ketzal.profiles(id) on delete cascade,
  booking_id  uuid,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (reporter_id, reported_id),
  check (reporter_id <> reported_id)
);
alter table ketzal.profile_reports enable row level security;
revoke all on ketzal.profile_reports from anon, authenticated;
-- Sin policies: sólo se escribe/lee por RPC DEFINER.

-- Proyección de co-pasajeros. Gate por dueño de pedido activo; niega con excepción
-- (ADR-0037: un guard que "niega con lista vacía" hace pantallas que mienten);
-- '[]' sólo cuando de verdad no hay nadie público.
create or replace function ketzal.co_travelers(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_svc uuid; v_date date;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select service_id, travel_date into v_svc, v_date
    from ketzal.bookings
   where id = p_booking_id and marketplace_customer_id = v_uid
     and status in ('reserved','confirmed','paid');
  if v_svc is null or v_date is null then
    raise exception 'Sin acceso a este viaje';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',         x.id,
        'nickname',   x.nickname,
        'city',       x.city,
        'dream_trip', x.dream_trip,
        'bio',        x.bio,
        'photo_path', x.social_photo_path
      ) order by x.nickname nulls last, x.id), '[]'::jsonb)
    from (
      select distinct on (pr.id)
             pr.id, pr.nickname, pr.city, pr.dream_trip, pr.bio, pr.social_photo_path
        from ketzal.bookings b
        join ketzal.profiles pr on pr.id = b.marketplace_customer_id
       where b.service_id = v_svc and b.travel_date = v_date
         and b.status in ('reserved','confirmed','paid')
         and pr.id <> v_uid
         and pr.is_public = true
         and pr.active
         and not exists (select 1 from ketzal.profile_reports r
                          where r.reporter_id = v_uid and r.reported_id = pr.id)
    ) x
  );
end
$function$;
revoke all on function ketzal.co_travelers(uuid) from public;
grant execute on function ketzal.co_travelers(uuid) to authenticated, service_role;

-- Reportar a un co-pasajero: sólo si comparten salida con pedido activo.
create or replace function ketzal.report_traveler(p_reported_id uuid, p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_svc uuid; v_date date;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_reported_id = v_uid then raise exception 'No puedes reportarte a ti mismo'; end if;
  select service_id, travel_date into v_svc, v_date
    from ketzal.bookings
   where id = p_booking_id and marketplace_customer_id = v_uid
     and status in ('reserved','confirmed','paid');
  if v_svc is null then raise exception 'Sin acceso a este viaje'; end if;
  if not exists (
    select 1 from ketzal.bookings b
     where b.service_id = v_svc and b.travel_date = v_date
       and b.marketplace_customer_id = p_reported_id
       and b.status in ('reserved','confirmed','paid')
  ) then
    raise exception 'Esa persona no viaja contigo';
  end if;
  insert into ketzal.profile_reports (reporter_id, reported_id, booking_id, reason)
  values (v_uid, p_reported_id, p_booking_id, nullif(left(btrim(coalesce(p_reason,'')), 300), ''))
  on conflict (reporter_id, reported_id) do update
    set reason = excluded.reason, booking_id = excluded.booking_id, created_at = now();
end
$function$;
revoke all on function ketzal.report_traveler(uuid,uuid,text) from public;
grant execute on function ketzal.report_traveler(uuid,uuid,text) to authenticated, service_role;

-- Revisión del admin (superadmin): lista de reportes con quién/quién/por qué.
-- La pantalla llega como fast-follow; los datos ya están.
create or replace function ketzal.list_profile_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal','pg_temp'
as $function$
begin
  if not coalesce(ketzal.is_superadmin(), false) then raise exception 'Solo superadmin'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'reporter_id', r.reporter_id, 'reporter', rp.email,
        'reported_id', r.reported_id, 'reported', dp.email,
        'reported_nickname', dp.nickname,
        'booking_id', r.booking_id, 'reason', r.reason, 'created_at', r.created_at
      ) order by r.created_at desc), '[]'::jsonb)
    from ketzal.profile_reports r
    join ketzal.profiles rp on rp.id = r.reporter_id
    join ketzal.profiles dp on dp.id = r.reported_id
  );
end
$function$;
revoke all on function ketzal.list_profile_reports() from public;
grant execute on function ketzal.list_profile_reports() to authenticated, service_role;
