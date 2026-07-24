-- b019 — Motor de comisiones: la comisión pasa de número derivado a ASIENTO.
--
-- CONTEXTO (docs/COMISIONES_MOTOR.md). Hoy la comisión = total*rate/100 se
-- recalcula al leer, duplicada en 3 RPCs, con 3 huecos: (1) el marketplace B2C
-- no deja corte a Ketzal (selling=owner), (2) cambiar una tasa reescribe el
-- pasado, (3) un solo beneficiario por venta — pero llegan EMBAJADORES que
-- cobran $X/pax, sumando un 3er cobrador sobre la misma venta.
--
-- DECISIÓN: ledger append-only `commission_lines`, UNA fila por beneficiario por
-- venta, congelada al cerrar (regla de oro #3: inmutable, corrección por
-- contra-asiento). El "cuánto" vive en `commission_rules` (resolver: la más
-- específica gana; cae al comportamiento legacy si no hay regla ⇒ 0 regresión).
--
-- COORDINACIÓN: todo objetos nuevos + columnas/CHECK aditivos. NO toca
-- create_booking_with_items, confirm_online_payment ni reports_summary. Solo
-- verificar_invariantes se re-aplica aditivo (+ check comision_excede_venta).

-- ============================================================================
-- 1. Columnas aditivas
-- ============================================================================
alter table ketzal.bookings  add column if not exists ambassador_id  uuid null references ketzal.suppliers(id);
alter table ketzal.suppliers add column if not exists referral_code   text null;
create unique index if not exists uq_suppliers_referral_code on ketzal.suppliers(referral_code) where referral_code is not null;

-- expenses: nueva categoría 'embajador' (paga a embajador por el ledger de F2)
alter table ketzal.expenses drop constraint if exists expenses_category_check;
alter table ketzal.expenses add  constraint expenses_category_check check (category in
  ('operacion','transporte','hospedaje','alimentos','mayorista','embajador','marketing','otro'));

-- ============================================================================
-- 2. commission_rules — config del "cuánto" (percent / fijo por venta / fijo por pax)
--    scope_supplier_id = quién define la regla (owner en reventa; embajador;
--    null = plataforma). NO es el que cobra: en reventa cobra el revendedor.
-- ============================================================================
create table if not exists ketzal.commission_rules (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid null references ketzal.services(id) on delete cascade,  -- null = regla general
  payee_type        text not null check (payee_type in ('plataforma','agencia','embajador')),
  scope_supplier_id uuid null references ketzal.suppliers(id),
  basis             text not null check (basis in ('percent','fijo_venta','fijo_pax')),
  rate              numeric(5,2)  null check (rate is null or (rate >= 0 and rate <= 100)),
  unit_amount       numeric(12,2) null check (unit_amount is null or unit_amount >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  -- coherencia basis↔valor
  constraint commission_rules_value_chk check (
    (basis = 'percent'     and rate is not null and unit_amount is null) or
    (basis in ('fijo_venta','fijo_pax') and unit_amount is not null and rate is null)),
  -- embajador/plataforma siempre llevan scope explícito coherente
  constraint commission_rules_scope_chk check (
    (payee_type = 'plataforma' and scope_supplier_id is null) or
    (payee_type in ('agencia','embajador') and scope_supplier_id is not null))
);
create unique index if not exists uq_commission_rules on ketzal.commission_rules
  (payee_type, coalesce(scope_supplier_id,'00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(service_id,'00000000-0000-0000-0000-000000000000'::uuid)) where active;
create index if not exists idx_commission_rules_lookup on ketzal.commission_rules(payee_type, scope_supplier_id, service_id);

alter table ketzal.commission_rules enable row level security;
-- Lectura: superadmin, o la agencia dueña de la regla (para su editor de tarifas).
drop policy if exists commission_rules_sel on ketzal.commission_rules;
create policy commission_rules_sel on ketzal.commission_rules for select using (
  ketzal.is_superadmin()
  or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()));
-- Escritura: plataforma y embajador = solo superadmin (Ketzal paga al embajador
-- de su corte). agencia = la propia agencia dueña.
drop policy if exists commission_rules_ins on ketzal.commission_rules;
create policy commission_rules_ins on ketzal.commission_rules for insert with check (
  ketzal.is_superadmin()
  or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id() and ketzal.is_active()));
drop policy if exists commission_rules_upd on ketzal.commission_rules;
create policy commission_rules_upd on ketzal.commission_rules for update using (
  ketzal.is_superadmin()
  or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()))
  with check (
  ketzal.is_superadmin()
  or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()));
drop policy if exists commission_rules_del on ketzal.commission_rules;
create policy commission_rules_del on ketzal.commission_rules for delete using (
  ketzal.is_superadmin()
  or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()));

-- ============================================================================
-- 3. commission_lines — el ASIENTO. Append-only, N filas por venta.
-- ============================================================================
create table if not exists ketzal.commission_lines (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references ketzal.bookings(id),
  payee_type        text not null check (payee_type in ('plataforma','agencia','embajador')),
  payee_supplier_id uuid null references ketzal.suppliers(id),  -- null = Ketzal plataforma
  basis             text not null check (basis in ('percent','fijo_venta','fijo_pax')),
  rate              numeric(5,2)  null,
  unit_amount       numeric(12,2) null,
  num_pax           int not null,
  amount_mxn        numeric(12,2) not null check (amount_mxn >= 0),
  kind              text not null default 'devengo' check (kind in ('devengo','reverso')),
  reverses_line_id  uuid null references ketzal.commission_lines(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_commission_lines_booking on ketzal.commission_lines(booking_id);
create index if not exists idx_commission_lines_payee   on ketzal.commission_lines(payee_supplier_id);
-- un devengo por (booking, payee_type, payee) — backstop de idempotencia
create unique index if not exists uq_commission_lines_devengo on ketzal.commission_lines
  (booking_id, payee_type, coalesce(payee_supplier_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'devengo';

alter table ketzal.commission_lines enable row level security;
-- Lectura: visibilidad de la venta (calco de bookings_sel) + el beneficiario ve lo suyo.
drop policy if exists commission_lines_sel on ketzal.commission_lines;
create policy commission_lines_sel on ketzal.commission_lines for select using (
  ketzal.is_superadmin()
  or (payee_supplier_id is not null and payee_supplier_id = ketzal.my_supplier_id())
  or exists (
    select 1 from ketzal.bookings b
    where b.id = commission_lines.booking_id
      and (b.sold_by = auth.uid()
           or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id()))));
-- SIN policies de insert/update/delete: escritura solo por trigger/RPC DEFINER.
drop trigger if exists no_mutar on ketzal.commission_lines;
create trigger no_mutar before delete or truncate on ketzal.commission_lines
  for each statement execute function ketzal.tg_ledger_inmutable();
revoke insert, update, delete, truncate on ketzal.commission_lines from anon, authenticated, service_role;

-- ============================================================================
-- 4. commission_amount — cálculo puro (espejo del helper de dominio TS)
-- ============================================================================
create or replace function ketzal.commission_amount(
  p_basis text, p_rate numeric, p_unit numeric, p_num_pax int, p_total numeric)
 returns numeric
 language sql immutable
 set search_path to ''
as $function$
  select case p_basis
    when 'percent'    then round(coalesce(p_total,0) * coalesce(p_rate,0) / 100.0, 2)
    when 'fijo_pax'   then round(coalesce(p_unit,0) * coalesce(p_num_pax,0), 2)
    when 'fijo_venta' then round(coalesce(p_unit,0), 2)
    else 0 end;
$function$;

-- ============================================================================
-- 5. resolve_commission_rule — la más específica gana; cae al legacy.
--    Devuelve (basis, rate, unit_amount); NULL si no hay tarifa (embajador).
-- ============================================================================
create or replace function ketzal.resolve_commission_rule(
  p_service uuid, p_payee_type text, p_scope uuid)
 returns table(basis text, rate numeric, unit_amount numeric)
 language plpgsql stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_platform numeric;
begin
  -- 1) regla específica por servicio
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and r.scope_supplier_id is not distinct from p_scope
      and r.service_id = p_service
    limit 1;
  if found then return; end if;
  -- 2) regla general (service_id null) del mismo scope
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and r.scope_supplier_id is not distinct from p_scope
      and r.service_id is null
    limit 1;
  if found then return; end if;
  -- 3) legacy: preserva el comportamiento actual (percent)
  if p_payee_type = 'plataforma' then
    select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
    return query select 'percent'::text, coalesce(v_platform,0)::numeric, null::numeric;
  elsif p_payee_type = 'agencia' then
    return query select 'percent'::text,
      coalesce((select commission_rate from ketzal.suppliers s where s.id = p_scope),0)::numeric, null::numeric;
  end if;  -- embajador sin legacy ⇒ 0 filas
end $function$;
revoke all on function ketzal.resolve_commission_rule(uuid,text,uuid) from public, anon;
grant execute on function ketzal.resolve_commission_rule(uuid,text,uuid) to authenticated, service_role;

-- ============================================================================
-- 6. tg_commission_snapshot — congela plataforma + agencia al cerrar la venta.
--    AFTER INSERT OR UPDATE OF status. Atrapa OS (nace reserved) y marketplace
--    (draft→reserved en confirm_online_payment). NO bloquea la venta (regla de
--    oro #3: registra + el health-check flaggea; corrección por contra-asiento).
-- ============================================================================
create or replace function ketzal.tg_commission_snapshot()
 returns trigger
 language plpgsql security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record; v_amt numeric(12,2); v_is_mkt boolean;
begin
  if NEW.status not in ('reserved','confirmed','paid') then return NEW; end if;
  v_is_mkt := NEW.marketplace_customer_id is not null;

  -- Línea PLATAFORMA: agente libre (selling null) o venta B2C marketplace.
  if (NEW.selling_supplier_id is null or v_is_mkt)
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='plataforma' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'plataforma', null);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'plataforma', null, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  -- Línea AGENCIA (reventa): la cobra el REVENDEDOR (selling); tasa la fija la DUEÑA (owner).
  if NEW.selling_supplier_id is not null
     and NEW.owner_supplier_id is not null
     and NEW.owner_supplier_id <> NEW.selling_supplier_id
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='agencia' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'agencia', NEW.owner_supplier_id);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'agencia', NEW.selling_supplier_id, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  return NEW;
end $function$;

revoke all on function ketzal.tg_commission_snapshot() from public, anon;
drop trigger if exists trg_commission_snapshot on ketzal.bookings;
create trigger trg_commission_snapshot after insert or update of status on ketzal.bookings
  for each row execute function ketzal.tg_commission_snapshot();

-- ============================================================================
-- 7. set_booking_ambassador — agrega la línea del embajador (append-only).
--    Idempotente. Raise si no hay tarifa o si excede el saldo de la venta.
-- ============================================================================
create or replace function ketzal.set_booking_ambassador(p_booking uuid, p_ambassador uuid)
 returns uuid
 language plpgsql security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then raise exception 'Venta no encontrada'; end if;
  -- Guard NULL-safe (coalesce ...,false): superadmin, quien vendió, la agencia
  -- operadora, o el comprador del marketplace sobre SU propia venta (para el ?ref).
  -- Sin el coalesce, `selling = my_supplier_id()` da NULL cuando el que llama no
  -- tiene agencia y `if not NULL` NO dispara ⇒ un autenticado suelto pasaría el guard.
  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    raise exception 'Sin permiso sobre esta venta';
  end if;
  if not exists (select 1 from ketzal.suppliers s where s.id = p_ambassador and s.supplier_type = 'embajador') then
    raise exception 'Embajador no válido';
  end if;

  -- idempotente
  select id into v_id from ketzal.commission_lines
    where booking_id = p_booking and payee_type='embajador' and kind='devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = p_ambassador where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

  select * into r from ketzal.resolve_commission_rule(b.service_id, 'embajador', p_ambassador);
  if r.basis is null then raise exception 'Este embajador no tiene tarifa configurada para este servicio'; end if;
  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then raise exception 'La tarifa del embajador resultó en 0'; end if;

  -- invariante: Σ comisiones (devengo−reverso) + esta ≤ total de la venta
  select coalesce(sum(case when kind='devengo' then amount_mxn else -amount_mxn end),0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then
    raise exception 'La comisión del embajador (%) excede el saldo disponible de la venta (total % , ya comprometido %)',
      v_amt, b.total, v_sum;
  end if;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', p_ambassador, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = p_ambassador where id = p_booking;
  return v_id;
end $function$;
revoke all on function ketzal.set_booking_ambassador(uuid,uuid) from public, anon;
grant execute on function ketzal.set_booking_ambassador(uuid,uuid) to authenticated, service_role;

-- ============================================================================
-- 8. verificar_invariantes — re-aplicado ADITIVO (+ comision_excede_venta).
--    Conservar este check si el otro agente re-aplica la función.
-- ============================================================================
create or replace function ketzal.verificar_invariantes()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'ketzal', 'public'
as $function$
declare v jsonb;
begin
  if auth.uid() is not null and not ketzal.is_superadmin() then
    raise exception 'Solo superadmin';
  end if;
  with viol as (
    select 'total_incoherente' as chk, b.id::text as booking_id,
           format('total %s <> subtotal %s - descuento %s', b.total, b.subtotal, b.discount) as detalle
    from ketzal.bookings b where round(b.total, 2) <> round(b.subtotal - b.discount, 2)
    union all
    select 'subtotal_vs_lineas', b.id::text, format('subtotal %s <> suma de líneas %s', b.subtotal, coalesce(li.s, 0))
    from ketzal.bookings b
    left join (select booking_id, sum(line_total) s from ketzal.booking_items group by booking_id) li on li.booking_id = b.id
    where round(b.subtotal, 2) <> round(coalesce(li.s, 0), 2)
    union all
    select 'plan_suma_vs_total', b.id::text, format('plan suma %s <> total %s', ps.s, b.total)
    from ketzal.bookings b
    join (select booking_id, sum(amount) s from ketzal.payment_schedule group by booking_id) ps on ps.booking_id = b.id
    where b.payment_type = 'abonos' and round(ps.s, 2) <> round(b.total, 2)
    union all
    select 'recibo_vs_pago', r.id::text, format('recibo %s (folio %s) <> pago %s', r.amount, r.folio, p.amount_mxn)
    from ketzal.receipts r join ketzal.payments p on p.id = r.payment_id
    where r.payment_id is not null and round(r.amount, 2) <> round(p.amount_mxn, 2)
    union all
    select 'folio_cot_duplicado', min(b.id::text), format('folio COT %s repetido %s veces en el mismo emisor', b.quote_folio, count(*))
    from ketzal.bookings b where b.quote_folio is not null
    group by coalesce(b.selling_supplier_id, b.sold_by), b.quote_folio having count(*) > 1
    union all
    select 'gasto_reverso_incoherente', e.id::text, format('reverso %s <> original %s', e.amount_mxn, o.amount_mxn)
    from ketzal.expenses e join ketzal.expenses o on o.id = e.reverses_expense_id
    where e.kind = 'reverso' and round(e.amount_mxn, 2) <> round(o.amount_mxn, 2)
    union all
    select 'gasto_doble_reverso', min(e.reverses_expense_id::text), format('gasto %s con %s reversos', e.reverses_expense_id, count(*))
    from ketzal.expenses e where e.reverses_expense_id is not null
    group by e.reverses_expense_id having count(*) > 1
    union all
    -- b019: la suma de comisiones (devengo−reverso) no puede exceder el total de la venta
    select 'comision_excede_venta', b.id::text,
           format('comisiones %s > total %s', cl.s, b.total)
    from ketzal.bookings b
    join (select booking_id, sum(case when kind='devengo' then amount_mxn else -amount_mxn end) s
          from ketzal.commission_lines group by booking_id) cl on cl.booking_id = b.id
    where round(cl.s, 2) > round(b.total, 2)
  )
  select jsonb_build_object('violaciones', count(*),
    'detalle', coalesce(jsonb_agg(jsonb_build_object('check', chk, 'booking_id', booking_id, 'detalle', detalle)), '[]'::jsonb)) into v
  from viol;
  return v;
end $function$;
