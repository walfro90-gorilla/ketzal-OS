-- b065 — un agente libre puede SOLICITAR unirse a una agencia existente.
-- Migraciones aplicadas: `b065_solicitudes_unirse_agencia` +
--                       `b065_list_agencies_to_join_id` (2026-08-19).
--
-- Hasta ahora la incorporación iba en un solo sentido: la agencia invita por
-- correo (`agency_invitations` + `accept_pending_invitation`, b018). Un agente
-- que ya está dentro de Ketzal sin agencia no tenía forma de pedir entrar a una;
-- dependía de que alguien adivinara su correo y lo invitara.
--
-- Esto es la dirección contraria: persona → agencia. NO es unilateral y no puede
-- serlo: si un agente pudiera meterse solo a una agencia vería todas sus ventas,
-- clientes y dinero. Es una SOLICITUD que el admin de esa agencia aprueba — el
-- espejo exacto de la invitación.
--
-- FUERA DE ALCANCE a propósito (decisión del fundador): crear agencia por cuenta
-- propia. Quien crea una queda admin de ella y podría publicar en /explora, que
-- lleva la marca Ketzal; abrir eso es una decisión de negocio aparte.
--
-- DECISIÓN PENDIENTE DE CONFIRMAR: al aceptar, las ventas previas del agente
-- como libre NO se tocan (siguen con `selling_supplier_id` null y su comisión de
-- plataforma ya asentada). El ledger es append-only: mover el dueño de ventas ya
-- cobradas exigiría contra-asentar y volver a devengar. De ahí en adelante vende
-- para la agencia.
--
-- ══ VERIFICACIÓN ══
-- Hard-test SQL con rollback, 9/9:
--   directorio para el agente libre .... 2 agencias
--   pide a 2, repite 1 ................. 2 pendientes (el índice único evita el duplicado)
--   viajero solicita ................... BLOQUEADO
--   admin Border ve .................... 1 (sólo la suya)
--   Border resuelve la de Wanderlust ... BLOQUEADO
--   admin Wanderlust ve ................ 1, y al aceptar entra como `user`
--   la solicitud a Border .............. cancelled (sola)
--   con agencia vuelve a pedir ......... BLOQUEADO
-- End-to-end en la UI real (dev + logins reales de las dos caras): el agente
-- libre ve la tarjeta con las 2 agencias, envía solicitud con mensaje, la ve como
-- "Enviada" con opción de retirar; el admin la ve en /equipo con el mensaje y al
-- Aceptar el agente queda en Wanderlust como agente. Todo revertido después.

create table if not exists ketzal.agency_join_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references ketzal.profiles(id) on delete cascade,
  supplier_id  uuid not null references ketzal.suppliers(id) on delete cascade,
  mensaje      text,
  status       text not null default 'pending'
               check (status in ('pending','accepted','rejected','cancelled')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references ketzal.profiles(id)
);

-- Una sola solicitud viva por (persona, agencia): reintentar no genera ruido.
create unique index if not exists uq_join_request_pendiente
  on ketzal.agency_join_requests (profile_id, supplier_id)
  where status = 'pending';

create index if not exists ix_join_requests_supplier
  on ketzal.agency_join_requests (supplier_id) where status = 'pending';

alter table ketzal.agency_join_requests enable row level security;

drop policy if exists join_requests_sel on ketzal.agency_join_requests;
create policy join_requests_sel on ketzal.agency_join_requests
for select to authenticated
using (
  profile_id = auth.uid()
  or ketzal.is_superadmin()
  or ketzal.is_agency_admin(supplier_id)
);

-- Escritura SÓLO por RPC (patrón del repo: profiles b017, sales_goals,
-- agency_invitations, credits). Sin GRANT no hay PostgREST que valga.
revoke insert, update, delete on ketzal.agency_join_requests from authenticated, anon;
grant select on ketzal.agency_join_requests to authenticated;

-- ── Directorio para el picker ────────────────────────────────────────────────
-- Sólo para agentes libres. No expone nada nuevo: las agencias ya salen en el
-- directorio público /agencias. Marca a cuáles ya les escribió y devuelve el id
-- de la solicitud viva, para poder retirarla sin una segunda consulta.
create or replace function ketzal.list_agencies_to_join()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from ketzal.profiles p
              where p.id = v_uid and p.supplier_id is not null) then
    raise exception 'Ya perteneces a una agencia.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nombre', s.name, 'logo', s.img_logo,
      'ciudad', s.info->>'ciudad',
      'acerca', s.description,
      'solicitud', r.status,
      'solicitud_id', case when r.status = 'pending' then r.id end)
      order by s.name)
    from ketzal.suppliers s
    left join lateral (
      select jr.id, jr.status
        from ketzal.agency_join_requests jr
       where jr.supplier_id = s.id and jr.profile_id = v_uid
       order by jr.created_at desc limit 1
    ) r on true
    where s.supplier_type = 'agency'
  ), '[]'::jsonb);
end $$;

-- ── El agente pide entrar ────────────────────────────────────────────────────
create or replace function ketzal.request_join_agency(p_supplier uuid, p_mensaje text default null)
returns uuid
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare v_uid uuid := auth.uid(); v_p ketzal.profiles; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_p from ketzal.profiles where id = v_uid;
  if not found then raise exception 'Perfil no encontrado'; end if;
  if v_p.supplier_id is not null then raise exception 'Ya perteneces a una agencia.'; end if;
  if coalesce(v_p.type::text, 'agente') <> 'agente' then
    raise exception 'Solo un agente de ventas puede unirse a una agencia.';
  end if;
  if not exists (select 1 from ketzal.suppliers s
                  where s.id = p_supplier and s.supplier_type = 'agency') then
    raise exception 'Esa agencia no existe.';
  end if;

  insert into ketzal.agency_join_requests(profile_id, supplier_id, mensaje)
  values (v_uid, p_supplier, nullif(trim(coalesce(p_mensaje,'')), ''))
  on conflict (profile_id, supplier_id) where status = 'pending'
  do update set mensaje = excluded.mensaje, created_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ── El agente retira su solicitud ────────────────────────────────────────────
create or replace function ketzal.cancel_join_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update ketzal.agency_join_requests
     set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
   where id = p_id and profile_id = v_uid and status = 'pending';
  if not found then raise exception 'Solicitud no encontrada o ya resuelta.'; end if;
end $$;

-- ── El admin ve las solicitudes a SU agencia ─────────────────────────────────
create or replace function ketzal.list_join_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'ketzal', 'public'
as $$
declare v_uid uuid := auth.uid(); v_sup uuid := ketzal.my_supplier_id();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if v_sup is null or not ketzal.is_agency_admin(v_sup) then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'mensaje', r.mensaje, 'creada', r.created_at,
      'nombre', p.name, 'email', p.email)
      order by r.created_at)
    from ketzal.agency_join_requests r
    join ketzal.profiles p on p.id = r.profile_id
    where r.supplier_id = v_sup and r.status = 'pending'
  ), '[]'::jsonb);
end $$;

-- ── El admin acepta o rechaza ────────────────────────────────────────────────
-- Al aceptar, el solicitante entra como AGENTE (`role='user'`), nunca como admin:
-- delegar mando es un acto aparte (`set_agency_member_role`, b018).
create or replace function ketzal.resolve_join_request(p_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare v_uid uuid := auth.uid(); v_r ketzal.agency_join_requests;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_r from ketzal.agency_join_requests where id = p_id for update;
  if not found or v_r.status <> 'pending' then
    raise exception 'Solicitud no encontrada o ya resuelta.';
  end if;
  if not (ketzal.is_superadmin() or ketzal.is_agency_admin(v_r.supplier_id)) then
    raise exception 'Solo un admin de esa agencia puede resolver la solicitud.';
  end if;
  -- Entre que pidió y que resolviste pudo haber entrado a otra agencia.
  if p_approve and exists (select 1 from ketzal.profiles p
                            where p.id = v_r.profile_id and p.supplier_id is not null) then
    raise exception 'Esa persona ya pertenece a una agencia.';
  end if;

  update ketzal.agency_join_requests
     set status = case when p_approve then 'accepted' else 'rejected' end,
         resolved_at = now(), resolved_by = v_uid
   where id = p_id;

  if p_approve then
    update ketzal.profiles
       set supplier_id = v_r.supplier_id, role = 'user', type = 'agente',
           active = true, updated_at = now()
     where id = v_r.profile_id;
    -- Las demás solicitudes vivas de esa persona quedan sin sentido.
    update ketzal.agency_join_requests
       set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
     where profile_id = v_r.profile_id and status = 'pending' and id <> p_id;
  end if;

  return jsonb_build_object('ok', true, 'aceptada', p_approve);
end $$;

revoke all on function ketzal.list_agencies_to_join() from public, anon;
revoke all on function ketzal.request_join_agency(uuid, text) from public, anon;
revoke all on function ketzal.cancel_join_request(uuid) from public, anon;
revoke all on function ketzal.list_join_requests() from public, anon;
revoke all on function ketzal.resolve_join_request(uuid, boolean) from public, anon;
grant execute on function ketzal.list_agencies_to_join() to authenticated, service_role;
grant execute on function ketzal.request_join_agency(uuid, text) to authenticated, service_role;
grant execute on function ketzal.cancel_join_request(uuid) to authenticated, service_role;
grant execute on function ketzal.list_join_requests() to authenticated, service_role;
grant execute on function ketzal.resolve_join_request(uuid, boolean) to authenticated, service_role;

-- APP (mismo carril):
--   dashboard/unirse-agencia.tsx  — tarjeta del agente sin agencia
--   dashboard/unirse-actions.ts   — solicitar / retirar / resolver
--   equipo/solicitudes-section.tsx — la otra cara, para el admin
