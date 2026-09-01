-- b083 — Cualquiera puede editar SU nombre, teléfono y foto.
-- Espejo de la migración aplicada `b083_editar_mi_perfil`.
--
-- Hasta ahora nadie que no fuera agente tenía cómo. `register_traveler` trae
-- `where profiles.type = 'viajero'`: para un embajador o un proveedor es un
-- no-op SILENCIOSO (la UI dice "Datos guardados" y no guarda nada), y además
-- nunca tocó `image`. `profiles` es RPC-only-write (b017), así que el camino es
-- una función DEFINER acotada.
--
-- Solo tres columnas, solo la fila propia. Nada de role, type, supplier_id,
-- active ni referral_code: eso lo decide quien administra, no el interesado.
--
-- La foto TIENE que vivir en `ketzal-assets`. Sin ese candado `image` es un
-- campo libre que el propio usuario apunta a donde quiera y la app lo pinta:
-- pixel de rastreo, contenido ajeno, o una URL que cambia de contenido después
-- de que alguien la aprobó.
create or replace function ketzal.update_my_profile(
  p_name text default null,
  p_phone text default null,
  p_image text default null
)
returns void
language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_img text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  v_img := nullif(btrim(coalesce(p_image, '')), '');
  if v_img is not null and v_img not like '%/storage/v1/object/public/ketzal-assets/%' then
    raise exception 'La foto debe subirse a Ketzal.';
  end if;

  update ketzal.profiles set
    name  = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    phone = case when p_phone is null then phone
                 else nullif(btrim(p_phone), '') end,
    image = case when p_image is null then image else v_img end
  where id = v_uid;
end $function$;

revoke all on function ketzal.update_my_profile(text, text, text) from public, anon;
grant execute on function ketzal.update_my_profile(text, text, text) to authenticated, service_role;
