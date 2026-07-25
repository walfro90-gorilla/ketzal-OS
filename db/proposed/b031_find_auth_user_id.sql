-- b031 — find_auth_user_id: id de un auth user por correo. Espejo de la migración
-- aplicada `b031_find_auth_user_id`.
--
-- Lo usa crearAgenciaEInvitarAdmin para REUTILIZAR una cuenta existente como admin
-- (cuando admin.createUser falla porque el correo ya tiene cuenta) en vez de fallar.
-- Solo service_role (expone existencia de cuenta ⇒ NO authenticated/anon).
create or replace function ketzal.find_auth_user_id(p_email text)
returns uuid language sql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$function$;
revoke all on function ketzal.find_auth_user_id(text) from public, anon, authenticated;
grant execute on function ketzal.find_auth_user_id(text) to service_role;
