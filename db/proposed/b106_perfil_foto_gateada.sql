-- b106 — Foto del perfil social del viajero, GATEADA (bucket privado).
-- A diferencia de las fotos de servicio/logo/embajador (bucket público
-- ketzal-assets, mundo-legible por URL), la foto social vive en ketzal-privado:
-- sólo se sirve por URL firmada del servidor. Fase 2b la mostrará a los
-- co-pasajeros; aquí sólo el dueño la sube y la ve.

alter table ketzal.profiles add column if not exists social_photo_path text;

-- El dueño puede subir a su propia carpeta del bucket privado (profiles/<uid>/).
-- Mismo patrón que el candado de `profiles` en el bucket público, pero en el
-- privado que hoy solo dejaba subir comprobantes SPEI.
drop policy if exists ketzal_privado_profiles_insert on storage.objects;
create policy ketzal_privado_profiles_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ketzal-privado'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

-- Se reemplaza el editor del viajero para aceptar la ruta de la foto. La ruta
-- se valida a la carpeta del propio usuario (no puede apuntar a la de otro).
-- El path se guarda TAL CUAL (no una URL): la foto se sirve firmada, nunca
-- pública. Se dropea la firma vieja (7 args) y se crea la de 8; la llamada por
-- nombre de la Fase 1 sigue resolviendo (el 8º va por default).
drop function if exists ketzal.update_my_traveler_profile(text,text,text,text,text,text,boolean);

create or replace function ketzal.update_my_traveler_profile(
  p_full_name         text    default null,
  p_phone             text    default null,
  p_nickname          text    default null,
  p_dream_trip        text    default null,
  p_bio               text    default null,
  p_city              text    default null,
  p_is_public         boolean default null,
  p_social_photo_path text    default null
) returns void
language plpgsql
security definer
set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_email text; v_photo text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select email into v_email from auth.users where id = v_uid;

  -- La foto TIENE que vivir en la carpeta privada del propio usuario. Sin este
  -- candado, `social_photo_path` sería un campo libre que el server firma:
  -- alguien apuntaría a la carpeta de otro y filtraría su foto.
  v_photo := nullif(btrim(coalesce(p_social_photo_path,'')), '');
  if v_photo is not null and v_photo not like ('profiles/' || v_uid::text || '/%') then
    raise exception 'La foto debe subirse a tu propio perfil.';
  end if;

  insert into ketzal.profiles (id, email, name, phone, type, active)
  values (
    v_uid, v_email,
    nullif(btrim(coalesce(p_full_name,'')),''),
    nullif(btrim(coalesce(p_phone,'')),''),
    'viajero', true
  )
  on conflict (id) do update set
    name              = coalesce(nullif(btrim(coalesce(p_full_name,'')),''), ketzal.profiles.name),
    phone             = case when p_phone      is null then ketzal.profiles.phone
                             else nullif(btrim(p_phone),'') end,
    nickname          = case when p_nickname   is null then ketzal.profiles.nickname
                             else nullif(left(btrim(p_nickname),   40),  '') end,
    dream_trip        = case when p_dream_trip is null then ketzal.profiles.dream_trip
                             else nullif(left(btrim(p_dream_trip), 140), '') end,
    bio               = case when p_bio        is null then ketzal.profiles.bio
                             else nullif(left(btrim(p_bio),        300), '') end,
    city              = case when p_city       is null then ketzal.profiles.city
                             else nullif(left(btrim(p_city),       80),  '') end,
    is_public         = coalesce(p_is_public, ketzal.profiles.is_public),
    social_photo_path = case when p_social_photo_path is null then ketzal.profiles.social_photo_path
                             else v_photo end,
    active            = true
  where ketzal.profiles.type = 'viajero';
end
$function$;

revoke all on function ketzal.update_my_traveler_profile(text,text,text,text,text,text,boolean,text) from public;
grant execute on function ketzal.update_my_traveler_profile(text,text,text,text,text,text,boolean,text) to authenticated, service_role;
