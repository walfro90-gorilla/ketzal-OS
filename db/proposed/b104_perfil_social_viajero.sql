-- b104 — Perfil social del viajero (Fase 1): campos editables + opt-in.
-- Fase 2 (aparte) agrega foto gateada + proyección de co-pasajeros. Aquí NO se
-- expone nada a otros usuarios; sólo el viajero edita y ve lo suyo.
-- profiles es RPC-only-write (b017): la escritura entra por DEFINER, nunca por REST.

alter table ketzal.profiles
  add column if not exists nickname   text,
  add column if not exists dream_trip text,
  add column if not exists bio        text,
  add column if not exists city       text,
  add column if not exists is_public  boolean not null default false;

-- Editor propio del viajero: upsert gateado a type='viajero' (mismo candado que
-- register_traveler — un agente NUNCA se vuelve viajero ni edita por aquí). Cada
-- campo se toca sólo si llega no-null; longitudes topadas para no guardar novelas.
create or replace function ketzal.update_my_traveler_profile(
  p_full_name  text    default null,
  p_phone      text    default null,
  p_nickname   text    default null,
  p_dream_trip text    default null,
  p_bio        text    default null,
  p_city       text    default null,
  p_is_public  boolean default null
) returns void
language plpgsql
security definer
set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select email into v_email from auth.users where id = v_uid;

  insert into ketzal.profiles (id, email, name, phone, type, active)
  values (
    v_uid, v_email,
    nullif(btrim(coalesce(p_full_name,'')),''),
    nullif(btrim(coalesce(p_phone,'')),''),
    'viajero', true
  )
  on conflict (id) do update set
    name       = coalesce(nullif(btrim(coalesce(p_full_name,'')),''), ketzal.profiles.name),
    phone      = case when p_phone      is null then ketzal.profiles.phone
                      else nullif(btrim(p_phone),'') end,
    nickname   = case when p_nickname   is null then ketzal.profiles.nickname
                      else nullif(left(btrim(p_nickname),   40),  '') end,
    dream_trip = case when p_dream_trip is null then ketzal.profiles.dream_trip
                      else nullif(left(btrim(p_dream_trip), 140), '') end,
    bio        = case when p_bio        is null then ketzal.profiles.bio
                      else nullif(left(btrim(p_bio),        300), '') end,
    city       = case when p_city       is null then ketzal.profiles.city
                      else nullif(left(btrim(p_city),       80),  '') end,
    is_public  = coalesce(p_is_public, ketzal.profiles.is_public),
    active     = true
  where ketzal.profiles.type = 'viajero';
end
$function$;

revoke all on function ketzal.update_my_traveler_profile(text,text,text,text,text,text,boolean) from public;
grant execute on function ketzal.update_my_traveler_profile(text,text,text,text,text,text,boolean) to authenticated, service_role;
