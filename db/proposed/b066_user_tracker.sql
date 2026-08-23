-- b066 — Tracker de usuarios: bitácora + expediente completo por cuenta.
--
-- ESPEJO de las migraciones aplicadas `b066_user_tracker`,
-- `b066_user_tracker_fix_folio` y `b066_user_tracker_recovery` (los dos últimos
-- ya están plegados aquí: este archivo es el estado final).
--
-- Motivo: el 2026-07-19 apareció una cuenta que nadie recordaba haber creado, y
-- reconstruir su origen tomó media hora de SQL forense contra `auth.sessions`.
-- `auth.audit_log_entries` está en 0 filas, así que Auth no deja rastro propio.
--
-- Dos piezas:
--   1. `user_events` — lo que NO es derivable: logins, altas, cambios de rol.
--   2. RPCs que ARMAN el expediente uniendo esa bitácora con lo que ya existe
--      (ventas, pagos, recibos, comisiones, ledger, invitaciones). No se
--      duplica ni un dato de negocio: se lee de su fuente.

-- ── 1. Bitácora ──────────────────────────────────────────────────────
create table if not exists ketzal.user_events (
  id uuid primary key default gen_random_uuid(),
  -- SIN foreign key a propósito: el valor de una bitácora es sobrevivir al
  -- borrado de la cuenta. Con `on delete cascade` habríamos perdido la
  -- evidencia justo cuando más sirve (fue el caso de hi.huchi0099).
  user_id uuid not null,
  -- Snapshot: si el perfil desaparece, el correo sigue diciendo de quién era.
  email text,
  kind text not null check (kind in (
    'signup', 'login', 'logout', 'password_reset_request', 'password_changed',
    'role_change', 'agency_change', 'activated', 'deactivated',
    'invited', 'invitation_accepted', 'join_request', 'join_resolved',
    'profile_updated', 'deleted', 'nota'
  )),
  actor_id uuid,
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_events_user_idx on ketzal.user_events (user_id, created_at desc);

alter table ketzal.user_events enable row level security;

drop policy if exists user_events_sel on ketzal.user_events;
create policy user_events_sel on ketzal.user_events for select to authenticated
using (
  ketzal.is_superadmin()
  or user_id = auth.uid()
  or exists (
    select 1 from ketzal.profiles p
     where p.id = ketzal.user_events.user_id
       and p.supplier_id is not null
       and p.supplier_id = ketzal.my_supplier_id()
  )
);

-- Escritura SOLO por RPC (patrón del repo: profiles b017, credits b051). Un
-- GRANT de tabla + policy sin restricción de columnas es escritura arbitraria
-- por PostgREST, y una bitácora que el auditado puede editar no es bitácora.
revoke insert, update, delete, truncate on ketzal.user_events from authenticated, anon;
grant select on ketzal.user_events to authenticated;

-- Append-only también en la BD. Función propia y no `tg_ledger_inmutable`: su
-- mensaje habla de asientos y refunds, que aquí no aplican y confunde.
create or replace function ketzal.tg_bitacora_inmutable()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception
    'bitácora append-only: % sobre % está prohibido. Un evento equivocado se corrige con otro evento.',
    tg_op, tg_table_name
    using errcode = 'P0001';
end $$;

revoke all on function ketzal.tg_bitacora_inmutable() from public, anon, authenticated;

drop trigger if exists user_events_no_mutar on ketzal.user_events;
create trigger user_events_no_mutar
  before delete or truncate on ketzal.user_events
  for each statement execute function ketzal.tg_bitacora_inmutable();

-- ── 2. Registrar un evento ───────────────────────────────────────────
create or replace function ketzal.log_user_event(
  p_user uuid,
  p_kind text,
  p_meta jsonb default '{}'::jsonb,
  p_ip text default null,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path to 'ketzal', 'pg_temp' as $$
declare
  -- El alta del comprador corre con service role: en ese momento puede no haber
  -- sesión todavía (si el proyecto exige confirmar el correo) y `auth.uid()`
  -- sería null.
  v_svc boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) = 'service_role';
begin
  -- Sobre uno mismo, sobre alguien de tu agencia si eres su admin, o cualquiera
  -- si eres superadmin. Sin esto cualquier autenticado podría ensuciar la
  -- bitácora de otro, que es peor que no tenerla.
  if not (
    v_svc
    or p_user = auth.uid()
    or ketzal.is_superadmin()
    or exists (
      select 1 from ketzal.profiles p
       where p.id = p_user
         and p.supplier_id is not null
         and p.supplier_id = ketzal.my_supplier_id()
         and ketzal.is_agency_admin(p.supplier_id)
    )
  ) then
    raise exception 'No puedes registrar eventos de esa cuenta.';
  end if;

  insert into ketzal.user_events (user_id, email, kind, actor_id, ip, user_agent, meta)
  values (
    p_user,
    (select email from ketzal.profiles where id = p_user),
    p_kind,
    auth.uid(),
    nullif(trim(p_ip), ''),
    nullif(trim(p_user_agent), ''),
    coalesce(p_meta, '{}'::jsonb)
  );
end $$;

-- ── 3. ¿Quién puede ver el expediente de quién? ──────────────────────
create or replace function ketzal.can_view_user(p_id uuid)
returns boolean language sql stable security definer
set search_path to 'ketzal', 'pg_temp' as $$
  select ketzal.is_superadmin()
      or p_id = auth.uid()
      or exists (
        select 1 from ketzal.profiles p
         where p.id = p_id
           and p.supplier_id is not null
           and p.supplier_id = ketzal.my_supplier_id()
           and ketzal.is_agency_admin(p.supplier_id)
      );
$$;

-- ── 4. Ficha de la cuenta (incluye lo que vive en el schema `auth`) ──
-- `recovery_sent_at` va aquí porque fue el campo que delató la cuenta sondeada
-- del 2026-07-19: correo de recuperación 110 ms después del alta.
create or replace function ketzal.user_account_detail(p_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
declare v jsonb;
begin
  if not ketzal.can_view_user(p_id) then
    raise exception 'No tienes acceso al expediente de esa cuenta.';
  end if;

  select jsonb_build_object(
    'id', coalesce(p.id, u.id),
    'nombre', p.name,
    'email', coalesce(p.email, u.email),
    'telefono', p.phone,
    'rol', p.role,
    'tipo', p.type,
    'activo', p.active,
    'supplier_id', p.supplier_id,
    'agencia', (select s.name from ketzal.suppliers s where s.id = p.supplier_id),
    'perfil_creado', p.created_at,
    'perfil_actualizado', p.updated_at,
    'auth', case when u.id is null then null else jsonb_build_object(
      'creada', u.created_at,
      'correo_confirmado', u.email_confirmed_at,
      'ultimo_acceso', u.last_sign_in_at,
      'proveedores', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
      'tiene_password', (u.encrypted_password is not null),
      'baneada_hasta', u.banned_until,
      'recuperacion_enviada', u.recovery_sent_at,
      'invitada', u.invited_at
    ) end,
    -- Sesiones VIVAS: es lo único que Supabase guarda con IP y navegador, y se
    -- borra al cerrar sesión. Por eso la bitácora captura el login aparte.
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creada', s.created_at, 'refrescada', s.refreshed_at,
        'ip', host(s.ip), 'navegador', s.user_agent
      ) order by s.created_at desc)
      from auth.sessions s where s.user_id = p_id
    ), '[]'::jsonb),
    'resumen', jsonb_build_object(
      'ventas_hechas', (select count(*) from ketzal.bookings b where b.sold_by = p_id),
      'compras', (select count(*) from ketzal.bookings b where b.marketplace_customer_id = p_id),
      'clientes_dados_de_alta', (select count(*) from ketzal.customers c where c.created_by = p_id),
      'recibos_emitidos', (select count(*) from ketzal.receipts r where r.issued_by = p_id),
      'eventos', (select count(*) from ketzal.user_events e where e.user_id = p_id)
    )
  ) into v
  from ketzal.profiles p
  -- `full join`: una cuenta puede existir en Auth sin perfil (o al revés, si se
  -- borró el usuario y quedó el perfil). El expediente tiene que mostrar ambos.
  full join auth.users u on u.id = p.id
  where coalesce(p.id, u.id) = p_id;

  return v;
end $$;

-- ── 5. Línea de tiempo: la bitácora + todo lo derivable ──────────────
create or replace function ketzal.user_timeline(p_id uuid, p_limit int default 300)
returns jsonb language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
declare
  v jsonb;
  v_email text;
  v_lim int := least(greatest(coalesce(p_limit, 300), 1), 1000);
begin
  if not ketzal.can_view_user(p_id) then
    raise exception 'No tienes acceso al expediente de esa cuenta.';
  end if;

  select coalesce(p.email, u.email) into v_email
    from ketzal.profiles p full join auth.users u on u.id = p.id
   where coalesce(p.id, u.id) = p_id;

  with eventos as (
    select e.created_at as ts, e.kind, 'bitacora' as fuente,
           jsonb_strip_nulls(jsonb_build_object(
             'ip', e.ip, 'navegador', e.user_agent,
             'actor', (select name from ketzal.profiles a where a.id = e.actor_id)
           ) || e.meta) as detalle,
           null::text as href
      from ketzal.user_events e where e.user_id = p_id

    union all
    select u.created_at, 'cuenta_creada', 'auth',
           jsonb_build_object('proveedores', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)),
           null
      from auth.users u where u.id = p_id

    union all
    select p.created_at, 'perfil_creado', 'perfil',
           jsonb_strip_nulls(jsonb_build_object('rol', p.role::text, 'tipo', p.type::text)), null
      from ketzal.profiles p where p.id = p_id

    union all
    select s.created_at, 'sesion_activa', 'auth',
           jsonb_strip_nulls(jsonb_build_object('ip', host(s.ip), 'navegador', s.user_agent)), null
      from auth.sessions s where s.user_id = p_id

    union all
    -- `folio` es text y `quote_folio` bigint: no se pueden coalescer, van aparte.
    select b.created_at, 'venta_creada', 'ventas',
           jsonb_strip_nulls(jsonb_build_object(
             'folio', b.folio,
             'cotizacion', case when b.quote_folio is null then null else 'COT-' || b.quote_folio end,
             'total', b.total, 'estado', b.status::text)),
           '/ventas/' || b.id
      from ketzal.bookings b where b.sold_by = p_id

    union all
    select b.created_at, 'compra', 'marketplace',
           jsonb_strip_nulls(jsonb_build_object('folio', b.folio, 'total', b.total, 'estado', b.status::text)),
           '/ventas/' || b.id
      from ketzal.bookings b where b.marketplace_customer_id = p_id

    union all
    select pa.created_at, case when pa.type = 'refund' then 'devolucion' else 'pago' end, 'dinero',
           jsonb_strip_nulls(jsonb_build_object(
             'monto', pa.amount_mxn, 'metodo', pa.payment_method, 'estado', pa.status::text)),
           case when pa.booking_id is null then null else '/ventas/' || pa.booking_id end
      from ketzal.payments pa where pa.user_id = p_id

    union all
    select r.issued_at, 'recibo_emitido', 'dinero',
           jsonb_build_object('folio', r.folio, 'monto', r.amount), '/recibo/' || r.id
      from ketzal.receipts r where r.issued_by = p_id

    union all
    select c.created_at, 'cliente_alta', 'clientes',
           jsonb_build_object('cliente', c.full_name), '/clientes'
      from ketzal.customers c where c.created_by = p_id

    union all
    select cl.created_at, case when cl.kind = 'reverso' then 'comision_revertida' else 'comision' end,
           'dinero', jsonb_build_object('monto', cl.amount_mxn, 'base', cl.basis::text),
           case when cl.booking_id is null then null else '/ventas/' || cl.booking_id end
      from ketzal.commission_lines cl where cl.payee_profile_id = p_id

    union all
    select le.created_at, 'asiento_ledger', 'dinero',
           jsonb_strip_nulls(jsonb_build_object('monto', le.amount_mxn, 'concepto', le.kind::text, 'nota', le.note)),
           '/cuentas'
      from ketzal.ledger_entries le where le.account_profile_id = p_id

    union all
    select jr.created_at, 'solicitud_agencia', 'equipo',
           jsonb_strip_nulls(jsonb_build_object(
             'agencia', (select s.name from ketzal.suppliers s where s.id = jr.supplier_id),
             'estado', jr.status::text, 'mensaje', jr.mensaje)),
           '/equipo'
      from ketzal.agency_join_requests jr where jr.profile_id = p_id

    union all
    -- Las invitaciones se guardan por correo, no por id: la cuenta puede no
    -- existir todavía cuando se invita.
    select ai.created_at, 'invitacion', 'equipo',
           jsonb_build_object(
             'agencia', (select s.name from ketzal.suppliers s where s.id = ai.supplier_id),
             'rol', ai.role::text, 'estado', ai.status::text),
           '/equipo'
      from ketzal.agency_invitations ai where v_email is not null and lower(ai.email) = lower(v_email)

    union all
    select n.created_at, 'notificacion', 'sistema',
           jsonb_strip_nulls(jsonb_build_object('titulo', n.title, 'texto', n.message)), n.action_url
      from ketzal.notifications n where n.user_id = p_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ts desc), '[]'::jsonb) into v
  from (
    select ts, kind, fuente, detalle, href from eventos
     where ts is not null
     order by ts desc limit v_lim
  ) x;

  return v;
end $$;

-- ── 6. Listado de cuentas ────────────────────────────────────────────
create or replace function ketzal.list_users(p_q text default null, p_limit int default 100)
returns jsonb language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
declare
  v jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.creada desc), '[]'::jsonb) into v
  from (
    select p.id, p.name as nombre, coalesce(p.email, u.email) as email,
           p.role::text as rol, p.type::text as tipo, p.active as activo,
           (select s.name from ketzal.suppliers s where s.id = p.supplier_id) as agencia,
           p.created_at as creada,
           u.last_sign_in_at as ultimo_acceso,
           (u.id is null) as sin_cuenta_auth
      from ketzal.profiles p
      left join auth.users u on u.id = p.id
     where ketzal.can_view_user(p.id)
       and (v_q is null
            or p.name ilike '%' || v_q || '%'
            or coalesce(p.email, u.email) ilike '%' || v_q || '%')
     limit v_lim
  ) t;
  return v;
end $$;

-- ── Permisos (patrón del repo: nada para anon) ───────────────────────
revoke all on function ketzal.log_user_event(uuid, text, jsonb, text, text) from public, anon;
revoke all on function ketzal.can_view_user(uuid) from public, anon;
revoke all on function ketzal.user_account_detail(uuid) from public, anon;
revoke all on function ketzal.user_timeline(uuid, int) from public, anon;
revoke all on function ketzal.list_users(text, int) from public, anon;

grant execute on function ketzal.log_user_event(uuid, text, jsonb, text, text) to authenticated, service_role;
grant execute on function ketzal.can_view_user(uuid) to authenticated, service_role;
grant execute on function ketzal.user_account_detail(uuid) to authenticated, service_role;
grant execute on function ketzal.user_timeline(uuid, int) to authenticated, service_role;
grant execute on function ketzal.list_users(text, int) to authenticated, service_role;

-- ── Hard-test aplicado en vivo (rollback vía RAISE) ──────────────────
-- A  superadmin registra sobre otra cuenta .......... ok (1 evento)
-- A2 snapshot de correo se llena solo ............... ok
-- B  agente raso escribe sobre ajeno ................ bloqueado
-- B2 agente raso escribe sobre sí mismo ............. ok
-- C  expediente ajeno ............................... denegado
-- C2 historial ajeno ................................ denegado
-- D  su propio expediente ........................... ok
-- D2 list_users(agente raso) ........................ 1 (sólo él)
-- E  DELETE sobre la bitácora ....................... bloqueado (append-only)
-- F  el evento aparece en el historial .............. ok
-- G  list_users(superadmin) ......................... 4
-- Residuo tras el rollback: 0. verificar_invariantes: 0. Advisors: 0 ERROR.
