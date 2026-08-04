-- b047 — Política de cancelación (C1 de docs/PLAN_CANCELACIONES.md).
-- Espejo de las migraciones aplicadas `ketzal_cancellation_policy` +
-- `ketzal_cancellation_policy_fix_guard` (consolidadas; el fix corrigió el
-- guard de dueño: los términos del OR se coalescen a false — un
-- marketplace_customer_id null hacía `false OR NULL = NULL` y `not NULL` no
-- disparaba el raise; lo cachó el hard-test).
--
-- Diseño:
--  · Definición en CASCADA sin tabla nueva: override por agencia en
--    suppliers.info->'cancellation_policy' (jsonb existente, patrón CLABE
--    SPEI b034) → default de plataforma en app_settings.cancellation_policy.
--  · La política se CONGELA en la venta (bookings.cancellation_policy jsonb,
--    snapshot idempotente): cambiarla después no cambia lo pactado.
--  · Aceptación con evidencia: policy_accepted_at + policy_accepted_meta
--    (canal checkout|cotizacion|agente + ip/ua + user_id; canal 'cotizacion'
--    llega por token anon). Una sola vez, one-way (solo si null).
--  · La pena NO es asiento: retener = no reembolsar. Ledger intacto.
--  · pena = max(tramo% × total, enganche del plan) con tope el total;
--    enganche = Σ payment_schedule kind='enganche' (contado sin plan ⇒ piso 0).
--  · RPCs NUEVOS e independientes — NO se re-aplican get_quote_by_token /
--    get_statement_by_token / create_booking_with_items / RPCs compartidos.
--    get_public_doc_policy sigue el patrón get_public_doc_currency (F6).
--
-- Guard de dueño (snapshot/accept, DEFINER): superadmin ∨ sold_by=uid ∨
-- selling=my_supplier_id() ∨ marketplace_customer_id=uid — replica
-- bookings_sel + el dueño B2C (que no tiene RLS directa sobre bookings).
-- preview_cancellation es INVOKER: la RLS del agente acota qué ventas ve.
--
-- Limitación conocida (aceptada a propósito): un agente con RLS de UPDATE
-- sobre su propia venta podría escribir policy_accepted_at por PostgREST sin
-- pasar por el RPC (bookings_upd no restringe columnas). Forjar su propia
-- evidencia solo lo perjudica a él en una disputa; la evidencia fuerte sigue
-- siendo el WhatsApp/checkout original. Si duele: column-level grants (v2).
--
-- Hard-test en vivo (fixtures QA e0460000-*, limpiadas, invariantes 0,
-- advisors 0 ERROR): snapshot cascada default/override + idempotente,
-- cross-agencia denegado, comprador acepta su pedido (2ª vez no-op) y no el
-- ajeno, anon por token (válida sella canal cotizacion, cancelada/random
-- null), canal inválido denegado, RLS de preview entre agencias, tramos
-- 10/50/no-show, piso enganche (pena 2000 > tramo 1000), congelamiento
-- (override 99% no mueve snapshot ni doc público).

-- 1) Definición default de plataforma ────────────────────────────────────────
alter table ketzal.app_settings add column if not exists cancellation_policy jsonb;

update ketzal.app_settings set cancellation_policy = jsonb '{
  "version": 1,
  "tramos": [
    {"dias_min": 30, "retencion_pct": 10},
    {"dias_min": 15, "retencion_pct": 25},
    {"dias_min": 7,  "retencion_pct": 50},
    {"dias_min": 2,  "retencion_pct": 75}
  ],
  "no_show_pct": 100,
  "piso_enganche": true,
  "credito": {"pct": 100, "vigencia_meses": 12},
  "cambio_fecha": {"gratis_primero": true, "aviso_min_dias": 20},
  "aviso_min_pax_dias": 7,
  "atraso_max_dias": 15
}'
where id = 1 and cancellation_policy is null;

-- 2) Snapshot por venta (nullable: ventas viejas = "sin política pactada") ───
alter table ketzal.bookings
  add column if not exists cancellation_policy jsonb,
  add column if not exists policy_accepted_at timestamptz,
  add column if not exists policy_accepted_meta jsonb;

-- 3) Resolución en cascada (DEFINER: el comprador B2C no ve suppliers) ───────
create or replace function ketzal.effective_cancellation_policy(p_supplier uuid)
returns jsonb
language sql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select coalesce(
    (select s.info->'cancellation_policy' from ketzal.suppliers s where s.id = p_supplier),
    (select a.cancellation_policy from ketzal.app_settings a where a.id = 1)
  );
$$;

-- 4) Snapshot idempotente (DEFINER + guard de dueño; solo escribe si null) ───
create or replace function ketzal.snapshot_booking_policy(p_booking uuid)
returns jsonb
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings;
  v_pol jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_b from ketzal.bookings where id = p_booking;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_b.marketplace_customer_id = v_uid, false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.cancellation_policy is not null then return v_b.cancellation_policy; end if;
  v_pol := ketzal.effective_cancellation_policy(v_b.selling_supplier_id);
  if v_pol is null then return null; end if;
  update ketzal.bookings
     set cancellation_policy = v_pol, updated_at = now()
   where id = p_booking and cancellation_policy is null;
  return v_pol;
end $$;

-- 5) Aceptación con evidencia (agente o comprador autenticado; one-way) ──────
create or replace function ketzal.accept_booking_policy(p_booking uuid, p_canal text, p_meta jsonb default null)
returns jsonb
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings;
  v_pol jsonb;
  v_meta jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_canal not in ('checkout', 'cotizacion', 'agente') then
    raise exception 'Canal inválido';
  end if;
  if p_meta is not null and pg_column_size(p_meta) > 4096 then
    raise exception 'Meta demasiado grande';
  end if;
  select * into v_b from ketzal.bookings where id = p_booking;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_b.marketplace_customer_id = v_uid, false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta está cancelada'; end if;
  if v_b.policy_accepted_at is not null then
    return jsonb_build_object('accepted_at', v_b.policy_accepted_at, 'ya_aceptada', true);
  end if;
  v_pol := ketzal.snapshot_booking_policy(p_booking);
  if v_pol is null then raise exception 'Sin política de cancelación definida'; end if;
  v_meta := coalesce(p_meta, '{}'::jsonb)
            || jsonb_build_object('canal', p_canal, 'user_id', v_uid);
  update ketzal.bookings
     set policy_accepted_at = now(), policy_accepted_meta = v_meta, updated_at = now()
   where id = p_booking and policy_accepted_at is null;
  return jsonb_build_object('accepted_at', now(), 'ya_aceptada', false);
end $$;

-- 6) Aceptación anon desde la cotización pública (por token, fail-closed) ────
create or replace function ketzal.accept_policy_by_token(p_token uuid, p_meta jsonb default null)
returns jsonb
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_b ketzal.bookings;
  v_pol jsonb;
  v_meta jsonb;
  v_at timestamptz;
begin
  if p_token is null then return null; end if;
  if p_meta is not null and pg_column_size(p_meta) > 4096 then
    raise exception 'Meta demasiado grande';
  end if;
  select * into v_b from ketzal.bookings
   where quote_token = p_token and status <> 'cancelled';
  if not found then return null; end if;
  v_pol := v_b.cancellation_policy;
  if v_pol is null then
    v_pol := ketzal.effective_cancellation_policy(v_b.selling_supplier_id);
    if v_pol is null then return null; end if;
    update ketzal.bookings
       set cancellation_policy = v_pol, updated_at = now()
     where id = v_b.id and cancellation_policy is null;
  end if;
  if v_b.policy_accepted_at is null then
    v_meta := coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('canal', 'cotizacion');
    update ketzal.bookings
       set policy_accepted_at = now(), policy_accepted_meta = v_meta, updated_at = now()
     where id = v_b.id and policy_accepted_at is null;
  end if;
  select policy_accepted_at into v_at from ketzal.bookings where id = v_b.id;
  return jsonb_build_object('ok', true, 'accepted_at', v_at);
end $$;

-- 7) Preview de cancelación (INVOKER, solo lectura; las dos salidas) ─────────
create or replace function ketzal.preview_cancellation(p_booking uuid)
returns jsonb
language plpgsql stable
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_b ketzal.bookings;
  v_pol jsonb;
  v_es_snapshot boolean;
  v_days int;
  v_tramo_pct numeric;
  v_eng numeric := 0;
  v_pena numeric;
  v_pagado numeric;
  v_vig int;
begin
  select * into v_b from ketzal.bookings where id = p_booking;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
  v_es_snapshot := v_b.cancellation_policy is not null;
  v_pol := coalesce(v_b.cancellation_policy,
                    ketzal.effective_cancellation_policy(v_b.selling_supplier_id));
  if v_pol is null then raise exception 'Sin política de cancelación definida'; end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn end), 0)
    into v_pagado
    from ketzal.payments
   where booking_id = p_booking and status = 'COMPLETED';

  if v_b.travel_date is null then
    return jsonb_build_object(
      'sin_fecha', true, 'pagado_mxn', v_pagado, 'es_snapshot', v_es_snapshot,
      'aceptada', v_b.policy_accepted_at is not null,
      'cancelada', v_b.status = 'cancelled');
  end if;

  v_days := v_b.travel_date - current_date;
  select (t->>'retencion_pct')::numeric into v_tramo_pct
    from jsonb_array_elements(v_pol->'tramos') t
   where v_days >= (t->>'dias_min')::int
   order by (t->>'dias_min')::int desc
   limit 1;
  v_tramo_pct := coalesce(v_tramo_pct, (v_pol->>'no_show_pct')::numeric, 100);

  if coalesce((v_pol->>'piso_enganche')::boolean, false) then
    select coalesce(sum(amount), 0) into v_eng
      from ketzal.payment_schedule
     where booking_id = p_booking and kind = 'enganche';
  end if;

  v_pena := least(v_b.total, greatest(round(v_b.total * v_tramo_pct / 100, 2), v_eng));
  v_vig := coalesce((v_pol->'credito'->>'vigencia_meses')::int, 12);

  return jsonb_build_object(
    'dias_antes', v_days,
    'tramo_pct', v_tramo_pct,
    'pena_mxn', v_pena,
    'pagado_mxn', v_pagado,
    'efectivo', jsonb_build_object('a_devolver_mxn', greatest(0, v_pagado - v_pena)),
    'credito', jsonb_build_object(
      'monto_mxn', round(v_pagado * coalesce((v_pol->'credito'->>'pct')::numeric, 100) / 100, 2),
      'expira', (current_date + make_interval(months => v_vig))::date),
    'es_snapshot', v_es_snapshot,
    'aceptada', v_b.policy_accepted_at is not null,
    'cancelada', v_b.status = 'cancelled');
end $$;

-- 8) Política para documentos públicos (anon, sin PII, LANGUAGE sql) ─────────
create or replace function ketzal.get_public_doc_policy(p_kind text, p_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select jsonb_build_object(
    'policy', coalesce(b.cancellation_policy,
                       ketzal.effective_cancellation_policy(b.selling_supplier_id)),
    'es_snapshot', b.cancellation_policy is not null,
    'accepted_at', b.policy_accepted_at)
  from ketzal.bookings b
  where b.status <> 'cancelled'
    and ((p_kind = 'quote' and b.quote_token = p_id)
      or (p_kind = 'statement' and b.statement_token = p_id))
  limit 1;
$$;

-- 9) Grants ──────────────────────────────────────────────────────────────────
revoke all on function ketzal.effective_cancellation_policy(uuid) from public, anon;
grant execute on function ketzal.effective_cancellation_policy(uuid) to authenticated, service_role;

revoke all on function ketzal.snapshot_booking_policy(uuid) from public, anon;
grant execute on function ketzal.snapshot_booking_policy(uuid) to authenticated, service_role;

revoke all on function ketzal.accept_booking_policy(uuid, text, jsonb) from public, anon;
grant execute on function ketzal.accept_booking_policy(uuid, text, jsonb) to authenticated, service_role;

revoke all on function ketzal.preview_cancellation(uuid) from public, anon;
grant execute on function ketzal.preview_cancellation(uuid) to authenticated, service_role;

revoke all on function ketzal.accept_policy_by_token(uuid, jsonb) from public;
grant execute on function ketzal.accept_policy_by_token(uuid, jsonb) to anon, authenticated, service_role;

revoke all on function ketzal.get_public_doc_policy(text, uuid) from public;
grant execute on function ketzal.get_public_doc_policy(text, uuid) to anon, authenticated, service_role;