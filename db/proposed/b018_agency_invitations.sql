-- b018 (carril backend) — Invitaciones de agencia (SaaS delegado) + delegación
-- de rol scopeada. Migración aplicada: ketzal_agency_invitations.
--
-- MODELO SaaS "delegado": el superadmin crea la agencia + invita a su admin;
-- ese admin invita a sus propios agentes; al primer login (email verificado por
-- el proveedor OAuth/magic-link) el invitado se AUTO-UNE a su agencia con el rol
-- invitado. Todo aislado por agencia: un admin de A no puede tocar B.
--
-- HARD-TEST (rolled back, 2026-07-23, agencias QA Alfa/Beta):
--   T1 admin invita a su agencia=ok · T2 admin→otra agencia=denegado ·
--   T3 admin invita superadmin=denegado · T4 superadmin invita a cualquiera=ok ·
--   T5 accept auto-une (user, activo) · T6 accept NO arrebata a un ya-asignado ·
--   T7a admin promueve user→admin en su agencia=ok · T7b promueve cross-agencia=denegado ·
--   T7c admin pone superadmin=denegado · T8 RLS: agencia B no ve invitaciones de A.
--   advisors 0 ERROR.
--
-- App: /auth/callback llama accept_pending_invitation() tras ensure_profile.
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create table if not exists ketzal.agency_invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  supplier_id uuid not null references ketzal.suppliers(id) on delete cascade,
  role        ketzal.user_role not null default 'user',
  invited_by  uuid,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  constraint agency_invitations_role_chk   check (role in ('user','admin')),
  constraint agency_invitations_status_chk check (status in ('pending','accepted','revoked'))
);

create unique index if not exists agency_invitations_pending_uq
  on ketzal.agency_invitations (lower(email), supplier_id) where status = 'pending';
create index if not exists agency_invitations_email_idx
  on ketzal.agency_invitations (lower(email)) where status = 'pending';

alter table ketzal.agency_invitations enable row level security;

drop policy if exists agency_invitations_sel on ketzal.agency_invitations;
create policy agency_invitations_sel on ketzal.agency_invitations
  for select using (ketzal.is_superadmin() or supplier_id = ketzal.my_supplier_id());

grant select on ketzal.agency_invitations to authenticated;
revoke insert, update, delete on ketzal.agency_invitations from authenticated;

-- Helper: ¿el caller es admin ACTIVO de la agencia p_supplier?
create or replace function ketzal.is_agency_admin(p_supplier uuid)
  returns boolean language sql stable security definer set search_path to 'ketzal','public'
as $$
  select exists (
    select 1 from ketzal.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.active
      and p.supplier_id = p_supplier
  );
$$;
revoke all on function ketzal.is_agency_admin(uuid) from public, anon;
grant execute on function ketzal.is_agency_admin(uuid) to authenticated, service_role;

-- invite_agent: superadmin invita a cualquier agencia (p_supplier requerido);
-- un admin de agencia solo a la SUYA, y solo rol user|admin (nunca superadmin).
create or replace function ketzal.invite_agent(
  p_email text, p_role ketzal.user_role default 'user', p_supplier uuid default null
) returns uuid
  language plpgsql security definer set search_path to 'ketzal','public'
as $$
declare
  v_email    text := lower(trim(p_email));
  v_super    boolean := ketzal.is_superadmin();
  v_mine     uuid := ketzal.my_supplier_id();
  v_role     ketzal.user_role := coalesce(p_role, 'user');
  v_supplier uuid;
  v_id       uuid;
begin
  if v_email is null or v_email !~ '^.+@.+\..+$' then
    raise exception 'Correo inválido.';
  end if;
  if v_role not in ('user','admin') then
    raise exception 'Rol inválido para invitación (solo user o admin).';
  end if;

  if v_super then
    v_supplier := p_supplier;
    if v_supplier is null then raise exception 'Falta la agencia destino.'; end if;
  else
    if v_mine is null or not ketzal.is_agency_admin(v_mine) then
      raise exception 'Solo un admin de agencia o el superadmin pueden invitar.';
    end if;
    if p_supplier is not null and p_supplier <> v_mine then
      raise exception 'No puedes invitar a otra agencia.';
    end if;
    v_supplier := v_mine;
  end if;

  if not exists (select 1 from ketzal.suppliers s where s.id = v_supplier and s.supplier_type = 'agency') then
    raise exception 'La agencia destino no existe.';
  end if;

  update ketzal.agency_invitations
     set role = v_role, invited_by = auth.uid(), created_at = now()
   where lower(email) = v_email and supplier_id = v_supplier and status = 'pending'
   returning id into v_id;
  if v_id is null then
    insert into ketzal.agency_invitations (email, supplier_id, role, invited_by)
    values (v_email, v_supplier, v_role, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function ketzal.invite_agent(text, ketzal.user_role, uuid) from public, anon;
grant execute on function ketzal.invite_agent(text, ketzal.user_role, uuid) to authenticated, service_role;

-- accept_pending_invitation: al primer login el usuario se une a la agencia que
-- lo invitó (por su email verificado), SOLO si aún no tiene agencia (no arrebata).
create or replace function ketzal.accept_pending_invitation()
  returns uuid
  language plpgsql security definer set search_path to 'ketzal','public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   record;
begin
  if v_uid is null then return null; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then return null; end if;

  if exists (select 1 from ketzal.profiles p where p.id = v_uid and p.supplier_id is not null) then
    return null;
  end if;

  select * into v_inv from ketzal.agency_invitations
   where lower(email) = v_email and status = 'pending'
   order by created_at desc limit 1;
  if v_inv.id is null then return null; end if;

  update ketzal.profiles
     set supplier_id = v_inv.supplier_id, role = v_inv.role, active = true
   where id = v_uid;
  update ketzal.agency_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;
  return v_inv.supplier_id;
end $$;
revoke all on function ketzal.accept_pending_invitation() from public, anon;
grant execute on function ketzal.accept_pending_invitation() to authenticated, service_role;

-- list_agency_invitations: pendientes de la agencia del caller (o todas si superadmin).
create or replace function ketzal.list_agency_invitations()
  returns jsonb
  language sql stable security definer set search_path to 'ketzal','public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'email', i.email, 'role', i.role, 'supplier_id', i.supplier_id,
      'agency', s.name, 'created_at', i.created_at
    ) order by i.created_at desc), '[]'::jsonb)
  from ketzal.agency_invitations i
  left join ketzal.suppliers s on s.id = i.supplier_id
  where i.status = 'pending'
    and (ketzal.is_superadmin() or i.supplier_id = ketzal.my_supplier_id());
$$;
revoke all on function ketzal.list_agency_invitations() from public, anon;
grant execute on function ketzal.list_agency_invitations() to authenticated, service_role;

-- revoke_invitation: superadmin cualquiera; admin solo la de SU agencia.
create or replace function ketzal.revoke_invitation(p_id uuid)
  returns void
  language plpgsql security definer set search_path to 'ketzal','public'
as $$
declare v_sup uuid;
begin
  select supplier_id into v_sup from ketzal.agency_invitations where id = p_id and status = 'pending';
  if v_sup is null then raise exception 'Invitación no encontrada.'; end if;
  if not (ketzal.is_superadmin() or ketzal.is_agency_admin(v_sup)) then
    raise exception 'No puedes revocar invitaciones de otra agencia.';
  end if;
  update ketzal.agency_invitations set status = 'revoked' where id = p_id;
end $$;
revoke all on function ketzal.revoke_invitation(uuid) from public, anon;
grant execute on function ketzal.revoke_invitation(uuid) to authenticated, service_role;

-- set_agency_member_role: delega user<->admin DENTRO de la agencia (nunca superadmin,
-- nunca cross-agencia). Superadmin puede sobre cualquier miembro de agencia.
create or replace function ketzal.set_agency_member_role(p_user uuid, p_role ketzal.user_role)
  returns void
  language plpgsql security definer set search_path to 'ketzal','public'
as $$
declare v_target_sup uuid;
begin
  if p_role not in ('user','admin') then
    raise exception 'Rol inválido (solo user o admin; superadmin es del god admin).';
  end if;
  select supplier_id into v_target_sup from ketzal.profiles where id = p_user;
  if v_target_sup is null then
    raise exception 'Ese usuario no pertenece a una agencia.';
  end if;
  if not (ketzal.is_superadmin() or ketzal.is_agency_admin(v_target_sup)) then
    raise exception 'Solo el superadmin o un admin de la misma agencia puede cambiar el rol.';
  end if;
  update ketzal.profiles set role = p_role where id = p_user;
end $$;
revoke all on function ketzal.set_agency_member_role(uuid, ketzal.user_role) from public, anon;
grant execute on function ketzal.set_agency_member_role(uuid, ketzal.user_role) to authenticated, service_role;
