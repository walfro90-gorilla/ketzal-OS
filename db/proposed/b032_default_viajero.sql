-- b032 — Todo usuario nuevo nace VIAJERO (cliente). Espejo de la migración
-- aplicada `b032_default_viajero` (prod wnujoyzdpdyxblgdtxjw).
--
-- Antes el default de profiles.type era 'agente' y ensure_profile lo heredaba
-- (insertaba id/email/name sin type) ⇒ un signup por Google/magic-link nacía
-- 'agente' pendiente. Regla del fundador: TODO usuario nuevo es viajero; los
-- roles internos (agente/embajador/proveedor) los otorga el admin después, o los
-- fija el flujo de alta específico (invitación de agencia, alta de embajador/
-- proveedor — que ya setean `type` explícito).
--
--   1) default de la columna type => 'viajero'
--   2) ensure_profile inserta type='viajero', active=true explícito
--   3) accept_pending_invitation fija type='agente' al unir al invitado (STAFF)
--      — antes venía del default 'agente', que ya no aplica; sin esto un invitado
--      quedaría viajero con supplier_id y el shell (ops) lo rebotaría a /mis-compras.
--
-- No toca filas existentes (el cambio de default no reescribe; ensure_profile es
-- on conflict do nothing). Hard-test en rollback: ensure_profile => viajero/activo;
-- accept con invitación => agente/agencia/rol. Advisors 0 ERROR.

alter table ketzal.profiles alter column type set default 'viajero';

create or replace function ketzal.ensure_profile()
returns void language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
begin
  insert into ketzal.profiles (id, email, name, type, active)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1)),
         'viajero', true
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end $function$;

create or replace function ketzal.accept_pending_invitation()
returns uuid language plpgsql security definer set search_path to 'ketzal','public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv record;
begin
  if v_uid is null then return null; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then return null; end if;
  if exists (select 1 from ketzal.profiles p where p.id = v_uid and p.supplier_id is not null) then
    return null;  -- ya pertenece a una agencia: no se toca
  end if;
  select * into v_inv from ketzal.agency_invitations
   where lower(email) = v_email and status = 'pending'
   order by created_at desc limit 1;
  if v_inv.id is null then return null; end if;
  -- El invitado es STAFF de agencia: se vuelve agente (no viajero) además de
  -- tomar su agencia y rol.
  update ketzal.profiles
     set supplier_id = v_inv.supplier_id, role = v_inv.role, type = 'agente', active = true
   where id = v_uid;
  update ketzal.agency_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;
  return v_inv.supplier_id;
end $function$;
