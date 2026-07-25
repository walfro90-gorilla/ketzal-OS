-- b029 — Contraseña provisional para el admin de agencia recién creado.
-- Espejo de la migración aplicada `b029_must_change_password` (prod wnujoyzdpdyxblgdtxjw).
--
-- El superadmin crea la agencia + la cuenta del admin con una contraseña temporal
-- (crearAgenciaEInvitarAdmin). El flag `must_change_password` fuerza a crear la suya
-- al primer login (el shell (ops) redirige a /nueva-password). Cero dependencia de
-- correo. El flag vive en profiles (se lee fresco de la BD, sin staleness del JWT).
alter table ketzal.profiles add column if not exists must_change_password boolean not null default false;

-- Baja el flag del propio usuario (authenticated no puede escribir profiles, b017).
-- No-op en el flujo normal de recuperación de contraseña.
create or replace function ketzal.clear_password_change_flag()
returns void language sql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
  update ketzal.profiles set must_change_password = false where id = auth.uid();
$function$;
revoke all on function ketzal.clear_password_change_flag() from public, anon;
grant execute on function ketzal.clear_password_change_flag() to authenticated, service_role;
