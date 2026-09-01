-- b078 — La invitación de agente CREA el perfil; deja de quemarse en el vacío.
-- Espejo de la migración aplicada `b078_invitacion_crea_el_perfil`.
--
-- El bug, reproducido en vivo contra el proyecto real (2026-08-31):
-- un invitado que entra por CONTRASEÑA no pasa por `/auth/callback`, y por lo
-- tanto nadie llama `ensure_profile()` antes. `accept_pending_invitation` hacía
-- `update ketzal.profiles ... where id = auth.uid()` sobre una fila que no
-- existe: 0 filas tocadas, ningún error — y a renglón seguido marcaba la
-- invitación como `accepted`. Resultado medido:
--
--   accept_pending_invitation -> 200 "dd46052b-…"   (dice que sí)
--   profile                   -> NO EXISTE
--   segundo intento tras ensure_profile -> null, la invitación ya estaba quemada
--   profile final             -> {"type":"viajero","supplier_id":null}
--
-- O sea: el agente invitado quedaba VIAJERO para siempre, aterrizando en
-- /mis-compras, y su invitación desaparecía de /equipo marcada como aceptada.
-- Sin un solo error en ningún lado. `/login` ya llamaba a este RPC tras el
-- signInWithPassword; lo que faltaba era que el RPC se bastara solo.
--
-- El arreglo es estructural, no un `if FOUND`: la función CREA el perfil si no
-- existe, con el rol y la agencia de la invitación. Así no depende del orden en
-- que la llame cada camino de login, que es de donde salió el hueco.
--
-- Se re-aplica ADITIVAMENTE desde el DDL vivo: se conservan los tres guards
-- (sin sesión, sin correo, y "no arrebata a quien ya tiene agencia") y el
-- `type='agente'` que puso b032.

create or replace function ketzal.accept_pending_invitation()
  returns uuid
  language plpgsql security definer set search_path to 'ketzal', 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_inv   record;
begin
  if v_uid is null then return null; end if;
  select lower(u.email),
         coalesce(u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1))
    into v_email, v_name
    from auth.users u where u.id = v_uid;
  if v_email is null then return null; end if;

  -- No arrebata: quien ya pertenece a una agencia no se mueve por una invitación.
  if exists (select 1 from ketzal.profiles p where p.id = v_uid and p.supplier_id is not null) then
    return null;
  end if;

  select * into v_inv from ketzal.agency_invitations
   where lower(email) = v_email and status = 'pending'
   order by created_at desc limit 1;
  if v_inv.id is null then return null; end if;

  -- CREA el perfil si no existe (era el UPDATE a secas que tocaba 0 filas).
  -- Mismo `name` que `ensure_profile`, para que el invitado no aparezca sin
  -- nombre en /equipo cuando este es el primer camino que lo materializa.
  insert into ketzal.profiles (id, email, name, type, role, supplier_id, active)
  values (v_uid, v_email, v_name, 'agente', v_inv.role, v_inv.supplier_id, true)
  on conflict (id) do update
     set supplier_id = excluded.supplier_id,
         role        = excluded.role,
         type        = 'agente',
         active      = true;

  update ketzal.agency_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;
  return v_inv.supplier_id;
end $function$;

revoke all on function ketzal.accept_pending_invitation() from public, anon;
grant execute on function ketzal.accept_pending_invitation() to authenticated, service_role;
