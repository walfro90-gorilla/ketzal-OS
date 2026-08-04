-- b052 — Ledger BALANCE-0 por actor (F1 del plan de finanzas de plataforma).
-- Espejo de la migración aplicada `b052_ledger`.
--
-- Doble partida: cada movimiento es un GRUPO de asientos cuya suma es 0
-- (+ a favor de la cuenta, − en contra). Cuentas: plataforma / agencia /
-- embajador / viajero. REGISTRO, no custodia: el dinero real sigue en MP/SPEI;
-- aquí viven derechos y obligaciones netos.
--
-- Fuentes (el ledger ESPEJA, no recrea — regla de [[finanzas-plataforma]]):
--  · commission_lines (motor b019): trigger AFTER INSERT espeja cada
--    devengo/reverso como grupo (payee +, agencia vendedora −). Backfill de
--    los devengos históricos incluido.
--  · Cobros MP sin cuenta conectada (b053): la plataforma recibe el cash por
--    cuenta de la agencia ⇒ grupo 'cobro_por_cuenta' (−plataforma total,
--    +agencia total); junto al devengo del fee el neto de la agencia queda
--    total − fee, pagable a 7 días (available_at).
--  · Split MP (b053): el fee se cobra al momento ⇒ grupo 'fee_cobrado_split'
--    (+agencia, −plataforma) que CIERRA el cargo del devengo.
--  · Liquidaciones manuales: settle_ledger (superadmin).
-- SPEI directo: el dinero llega completo a la agencia ⇒ su cargo del fee es el
-- espejo del devengo — queda como saldo por cobrar de la plataforma. (El
-- "cargo por servicio de Ketzal al recibir SPEI" que pidió el fundador.)
--
-- Append-only (no_mutar + REVOKE); escritura SOLO vía ledger_post (interna,
-- valida suma 0). Lectura: superadmin todo; admin de agencia su cuenta;
-- embajador/viajero la suya (vía RPC statement, tabla sin SELECT directo para
-- authenticated — más simple y a prueba de fugas).

create table if not exists ketzal.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  account_type text not null check (account_type in ('plataforma','agencia','embajador','viajero')),
  account_supplier_id uuid references ketzal.suppliers(id),
  account_profile_id uuid references ketzal.profiles(id),
  kind text not null check (kind in (
    'devengo','reverso','fee_cobrado_split','cobro_por_cuenta','payout','liquidacion','ajuste')),
  amount_mxn numeric(12,2) not null check (amount_mxn <> 0),
  booking_id uuid references ketzal.bookings(id),
  payment_id uuid references ketzal.payments(id),
  commission_line_id uuid references ketzal.commission_lines(id),
  available_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint ledger_account_shape_chk check (
    (account_type = 'plataforma' and account_supplier_id is null and account_profile_id is null)
    or (account_type = 'agencia' and account_supplier_id is not null and account_profile_id is null)
    or (account_type in ('embajador','viajero') and account_profile_id is not null and account_supplier_id is null)
  )
);

create index if not exists ledger_entries_group_idx on ketzal.ledger_entries (group_id);
create index if not exists ledger_entries_cuenta_idx
  on ketzal.ledger_entries (account_type, account_supplier_id, account_profile_id, created_at desc);

alter table ketzal.ledger_entries enable row level security;
revoke all on ketzal.ledger_entries from authenticated, anon;

-- Append-only al estilo payments (trigger no_mutar existente).
drop trigger if exists ledger_no_mutar on ketzal.ledger_entries;
create trigger ledger_no_mutar
  before update or delete on ketzal.ledger_entries
  for each row execute function ketzal.tg_ledger_inmutable();

-- ── Escritura interna: un grupo balanceado o nada ────────────────────────────
create or replace function ketzal.ledger_post(p_entries jsonb)
 returns uuid
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_group uuid := gen_random_uuid();
  v_sum numeric := 0;
  e jsonb;
begin
  if p_entries is null or jsonb_array_length(p_entries) < 2 then
    raise exception 'Un grupo del ledger requiere al menos 2 asientos.';
  end if;
  for e in select value from jsonb_array_elements(p_entries) loop
    v_sum := v_sum + (e->>'amount_mxn')::numeric;
  end loop;
  if round(v_sum, 2) <> 0 then
    raise exception 'Grupo desbalanceado: la suma debe ser 0 (fue %).', round(v_sum, 2);
  end if;
  insert into ketzal.ledger_entries
    (group_id, account_type, account_supplier_id, account_profile_id, kind,
     amount_mxn, booking_id, payment_id, commission_line_id, available_at, note, created_by)
  select v_group, ent->>'account_type',
         nullif(ent->>'account_supplier_id','')::uuid,
         nullif(ent->>'account_profile_id','')::uuid,
         ent->>'kind', (ent->>'amount_mxn')::numeric,
         nullif(ent->>'booking_id','')::uuid,
         nullif(ent->>'payment_id','')::uuid,
         nullif(ent->>'commission_line_id','')::uuid,
         nullif(ent->>'available_at','')::timestamptz,
         ent->>'note', auth.uid()
  from jsonb_array_elements(p_entries) ent;
  return v_group;
end $function$;

revoke all on function ketzal.ledger_post(jsonb) from public, anon, authenticated;

-- ── Espejo del motor de comisiones ───────────────────────────────────────────
-- Cada línea del motor (devengo o reverso) genera su grupo: el PAYEE a favor,
-- la agencia VENDEDORA en contra (reverso invierte). No toca el motor.
create or replace function ketzal.tg_ledger_mirror_commission()
 returns trigger
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_selling uuid;
  v_sign numeric := case when new.kind = 'reverso' then -1 else 1 end;
  v_payee jsonb;
begin
  select selling_supplier_id into v_selling from ketzal.bookings where id = new.booking_id;
  if v_selling is null or new.amount_mxn = 0 then return new; end if;

  v_payee := case new.payee_type
    when 'plataforma' then jsonb_build_object('account_type','plataforma')
    when 'agencia'    then jsonb_build_object('account_type','agencia','account_supplier_id', new.payee_supplier_id)
    else                   jsonb_build_object('account_type','embajador','account_profile_id', new.payee_profile_id)
  end;

  -- Autopago (payee = la misma vendedora): no hay deuda que registrar.
  if new.payee_type = 'agencia' and new.payee_supplier_id = v_selling then return new; end if;

  perform ketzal.ledger_post(jsonb_build_array(
    v_payee || jsonb_build_object(
      'kind', new.kind, 'amount_mxn', v_sign * new.amount_mxn,
      'booking_id', new.booking_id, 'commission_line_id', new.id,
      'note', 'Comisión ' || new.payee_type),
    jsonb_build_object(
      'account_type','agencia','account_supplier_id', v_selling,
      'kind', new.kind, 'amount_mxn', -1 * v_sign * new.amount_mxn,
      'booking_id', new.booking_id, 'commission_line_id', new.id,
      'note', 'Comisión ' || new.payee_type || ' (a cargo)')
  ));
  return new;
end $function$;

drop trigger if exists ledger_mirror_commission on ketzal.commission_lines;
create trigger ledger_mirror_commission
  after insert on ketzal.commission_lines
  for each row execute function ketzal.tg_ledger_mirror_commission();

-- Backfill de los devengos históricos (idempotente por commission_line_id).
do $backfill$
declare r record; v_selling uuid; v_sign numeric; v_payee jsonb;
begin
  for r in
    select cl.* from ketzal.commission_lines cl
    where not exists (select 1 from ketzal.ledger_entries le where le.commission_line_id = cl.id)
  loop
    select selling_supplier_id into v_selling from ketzal.bookings where id = r.booking_id;
    if v_selling is null or r.amount_mxn = 0 then continue; end if;
    if r.payee_type = 'agencia' and r.payee_supplier_id = v_selling then continue; end if;
    v_sign := case when r.kind = 'reverso' then -1 else 1 end;
    v_payee := case r.payee_type
      when 'plataforma' then jsonb_build_object('account_type','plataforma')
      when 'agencia'    then jsonb_build_object('account_type','agencia','account_supplier_id', r.payee_supplier_id)
      else                   jsonb_build_object('account_type','embajador','account_profile_id', r.payee_profile_id)
    end;
    perform ketzal.ledger_post(jsonb_build_array(
      v_payee || jsonb_build_object('kind', r.kind, 'amount_mxn', v_sign * r.amount_mxn,
        'booking_id', r.booking_id, 'commission_line_id', r.id, 'note', 'Comisión ' || r.payee_type),
      jsonb_build_object('account_type','agencia','account_supplier_id', v_selling,
        'kind', r.kind, 'amount_mxn', -1 * v_sign * r.amount_mxn,
        'booking_id', r.booking_id, 'commission_line_id', r.id,
        'note', 'Comisión ' || r.payee_type || ' (a cargo)')
    ));
  end loop;
end $backfill$;

-- ── Estado de cuenta (F1) ────────────────────────────────────────────────────
-- Superadmin: todas las cuentas. Admin de agencia: la suya. Embajador/viajero:
-- la propia (por profile).
create or replace function ketzal.ledger_summary()
 returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
  v_admin boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_admin := exists (select 1 from ketzal.profiles p
                     where p.id = v_uid and p.role = 'admin' and p.active);
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.account_type, x.nombre), '[]'::jsonb)
    from (
      select le.account_type,
             coalesce(s.name, pr.name,
               case when le.account_type = 'plataforma' then 'Ketzal (plataforma)' end) as nombre,
             le.account_supplier_id, le.account_profile_id,
             sum(le.amount_mxn) as saldo,
             count(*) as movimientos,
             max(le.created_at) as ultimo
      from ketzal.ledger_entries le
      left join ketzal.suppliers s on s.id = le.account_supplier_id
      left join ketzal.profiles pr on pr.id = le.account_profile_id
      where v_super
         or (v_admin and le.account_type = 'agencia' and le.account_supplier_id = v_supplier)
         or (le.account_profile_id = v_uid)
      group by le.account_type, le.account_supplier_id, le.account_profile_id, s.name, pr.name
    ) x
  );
end $function$;

revoke all on function ketzal.ledger_summary() from public, anon;
grant execute on function ketzal.ledger_summary() to authenticated, service_role;

create or replace function ketzal.ledger_statement(
  p_account_type text, p_supplier uuid default null, p_profile uuid default null, p_limit int default 100
) returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
  v_admin boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_admin := exists (select 1 from ketzal.profiles p
                     where p.id = v_uid and p.role = 'admin' and p.active);
  -- Guard: superadmin cualquiera; admin su agencia; persona su propio profile.
  if not v_super then
    if p_account_type = 'agencia' then
      if not (v_admin and p_supplier = v_supplier) then
        raise exception 'Sin acceso a esa cuenta.';
      end if;
    elsif p_account_type in ('embajador','viajero') then
      if p_profile is distinct from v_uid then
        raise exception 'Sin acceso a esa cuenta.';
      end if;
    else
      raise exception 'Sin acceso a esa cuenta.';
    end if;
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
    from (
      select le.id, le.kind, le.amount_mxn, le.note, le.booking_id,
             le.available_at, le.created_at
      from ketzal.ledger_entries le
      where le.account_type = p_account_type
        and (p_account_type <> 'agencia' or le.account_supplier_id = p_supplier)
        and (p_account_type not in ('embajador','viajero') or le.account_profile_id = p_profile)
      order by le.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) m
  );
end $function$;

revoke all on function ketzal.ledger_statement(text, uuid, uuid, int) from public, anon;
grant execute on function ketzal.ledger_statement(text, uuid, uuid, int) to authenticated, service_role;

-- ── Liquidación manual (superadmin): cierra saldos entre plataforma y una
-- cuenta (p.ej. la agencia paga el fee, o la plataforma paga un payout). ─────
create or replace function ketzal.settle_ledger(
  p_account_type text, p_supplier uuid default null, p_profile uuid default null,
  p_amount numeric default null, p_note text default null
) returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_saldo numeric;
  v_amount numeric(12,2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_superadmin() then
    raise exception 'Solo el superadmin liquida cuentas.';
  end if;
  if p_account_type not in ('agencia','embajador','viajero') then
    raise exception 'Cuenta inválida.';
  end if;

  select coalesce(sum(amount_mxn), 0) into v_saldo
  from ketzal.ledger_entries
  where account_type = p_account_type
    and (account_supplier_id = p_supplier or account_supplier_id is null and p_supplier is null)
    and (account_profile_id = p_profile or account_profile_id is null and p_profile is null);

  -- default: liquidar el saldo completo; el signo del asiento lo CANCELA.
  v_amount := round(coalesce(p_amount, abs(v_saldo)), 2);
  if v_amount <= 0 then raise exception 'Nada que liquidar (saldo %).', v_saldo; end if;
  if v_amount > abs(v_saldo) + 0.005 then
    raise exception 'El monto (%) excede el saldo (%).', v_amount, v_saldo;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object('account_type', p_account_type,
      'account_supplier_id', p_supplier, 'account_profile_id', p_profile,
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then -v_amount else v_amount end,
      'note', coalesce(p_note, 'Liquidación')),
    jsonb_build_object('account_type', 'plataforma',
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then v_amount else -v_amount end,
      'note', coalesce(p_note, 'Liquidación'))
  ));
  return jsonb_build_object('ok', true, 'liquidado', v_amount, 'saldo_previo', v_saldo);
end $function$;

revoke all on function ketzal.settle_ledger(text, uuid, uuid, numeric, text) from public, anon;
grant execute on function ketzal.settle_ledger(text, uuid, uuid, numeric, text) to authenticated, service_role;
