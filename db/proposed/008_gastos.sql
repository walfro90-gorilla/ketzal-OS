-- 008 — Gastos + Cuentas por Pagar a mayoristas (Plan F2).
--
-- CONTEXTO. El competidor lleva "Gastos" y "Cuentas por Pagar". Ketzal solo
-- tenía el ledger de ingresos (payments). Esto agrega el segundo ledger,
-- ESPEJO de payments: append-only, RLS por agencia, corrección por
-- contra-asiento (kind='reverso'), nunca update/delete.
--
-- DECISIÓN (plan §F2): los pagos a mayorista son filas de `expenses` con
-- category='mayorista' (un solo ledger de egresos ⇒ la utilidad = vendido −
-- gastos ya incluye los pagos a mayorista sin doble contabilidad). NO hay tabla
-- supplier_payments aparte.
--
-- Regla de oro #3 (append-only en la BD): trigger no_mutar (reusa
-- tg_ledger_inmutable) + REVOKE update,delete,truncate. Un gasto JAMÁS se edita.

-- ---------- 1. Tabla expenses (ledger de egresos, append-only) ----------------
create table if not exists ketzal.expenses (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid null,                              -- agencia (RLS); null = agente libre
  created_by          uuid not null,                          -- quien registra (auth.uid)
  kind                text not null default 'egreso' check (kind in ('egreso','reverso')),
  reverses_expense_id uuid null references ketzal.expenses(id),
  concept             text not null,
  category            text not null check (category in
                        ('operacion','transporte','hospedaje','alimentos','mayorista','marketing','otro')),
  amount_mxn          numeric(12,2) not null check (amount_mxn > 0),
  method              text null,                              -- efectivo/transferencia/deposito/tarjeta/otro
  spent_at            date not null default current_date,
  provider_supplier_id uuid null references ketzal.suppliers(id),
  booking_id          uuid null references ketzal.bookings(id),
  notes               text null,
  created_at          timestamptz not null default now(),
  -- Un pago a mayorista exige el proveedor (para la CxP).
  constraint expenses_mayorista_provider check (category <> 'mayorista' or provider_supplier_id is not null)
);

create index if not exists idx_expenses_supplier on ketzal.expenses(supplier_id);
create index if not exists idx_expenses_provider on ketzal.expenses(provider_supplier_id);

alter table ketzal.expenses enable row level security;

-- RLS calco de payments_scoped_* (usa created_by como el user que registra).
drop policy if exists expenses_scoped_sel on ketzal.expenses;
create policy expenses_scoped_sel on ketzal.expenses for select using (
  ketzal.is_superadmin() or created_by = auth.uid()
  or (supplier_id is not null and supplier_id = ketzal.my_supplier_id())
);
drop policy if exists expenses_scoped_ins on ketzal.expenses;
create policy expenses_scoped_ins on ketzal.expenses for insert with check (
  ketzal.is_active() and created_by = auth.uid()
  and (supplier_id is null or supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin())
);
-- SIN policies de update/delete: append-only.

-- Append-only ESTRICTO (más que payments: sin update tampoco).
drop trigger if exists no_mutar on ketzal.expenses;
create trigger no_mutar before delete or truncate on ketzal.expenses
  for each statement execute function ketzal.tg_ledger_inmutable();
revoke update, delete, truncate on ketzal.expenses from anon, authenticated, service_role;

-- ---------- 2. create_expense (INVOKER) ---------------------------------------
create or replace function ketzal.create_expense(
  p_concept text, p_category text, p_amount numeric, p_method text, p_spent_at date,
  p_provider_supplier_id uuid default null, p_booking_id uuid default null, p_notes text default null)
 returns uuid
 language plpgsql
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_sup uuid := ketzal.my_supplier_id();
        v_amount numeric(12,2) := round(p_amount, 2); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  if coalesce(trim(p_concept),'') = '' then raise exception 'Falta el concepto del gasto'; end if;
  if p_category not in ('operacion','transporte','hospedaje','alimentos','mayorista','marketing','otro')
    then raise exception 'Categoría inválida'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_category = 'mayorista' and p_provider_supplier_id is null
    then raise exception 'Un pago a mayorista requiere el proveedor'; end if;

  insert into ketzal.expenses(supplier_id, created_by, kind, concept, category, amount_mxn,
    method, spent_at, provider_supplier_id, booking_id, notes)
  values (v_sup, v_uid, 'egreso', trim(p_concept), p_category, v_amount,
    nullif(trim(coalesce(p_method,'')),''), coalesce(p_spent_at, current_date),
    p_provider_supplier_id, p_booking_id, nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end $function$;

revoke all on function ketzal.create_expense(text,text,numeric,text,date,uuid,uuid,text) from public, anon;
grant execute on function ketzal.create_expense(text,text,numeric,text,date,uuid,uuid,text) to authenticated;

-- ---------- 3. reverse_expense (INVOKER, contra-asiento) ----------------------
create or replace function ketzal.reverse_expense(p_expense_id uuid, p_reason text)
 returns uuid
 language plpgsql
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); r ketzal.expenses; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  select * into r from ketzal.expenses where id = p_expense_id;  -- RLS acota lo visible
  if r.id is null then raise exception 'Gasto no encontrado o sin acceso'; end if;
  if r.kind = 'reverso' then raise exception 'No puedes revertir un reverso'; end if;
  if exists (select 1 from ketzal.expenses e where e.reverses_expense_id = p_expense_id) then
    raise exception 'Este gasto ya tiene un reverso'; end if;

  insert into ketzal.expenses(supplier_id, created_by, kind, reverses_expense_id, concept, category,
    amount_mxn, method, spent_at, provider_supplier_id, booking_id, notes)
  values (r.supplier_id, v_uid, 'reverso', p_expense_id,
    'Reverso: ' || r.concept || ' (' || coalesce(nullif(trim(p_reason),''), 'sin motivo') || ')',
    r.category, r.amount_mxn, r.method, current_date, r.provider_supplier_id, r.booking_id, r.notes)
  returning id into v_id;
  return v_id;
end $function$;

revoke all on function ketzal.reverse_expense(uuid, text) from public, anon;
grant execute on function ketzal.reverse_expense(uuid, text) to authenticated;

-- ---------- 4. expenses_summary (DEFINER, scoping como reports_summary) -------
create or replace function ketzal.expenses_summary(p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id(); v_uid uuid := auth.uid();
begin
  with scoped as (
    select e.category, e.spent_at,
      case when e.kind = 'egreso' then e.amount_mxn else -e.amount_mxn end as neto
    from ketzal.expenses e
    where e.spent_at >= p_from and e.spent_at <= p_to
      and (v_super
           or (v_sup is not null and e.supplier_id = v_sup)
           or e.created_by = v_uid)
  )
  select jsonb_build_object(
    'total_gastos', coalesce(sum(neto), 0),
    'num', count(*),
    'por_categoria', coalesce((select jsonb_agg(c order by (c->>'total')::numeric desc) from (
        select jsonb_build_object('category', category, 'total', sum(neto)) as c
        from scoped group by category having sum(neto) <> 0) x), '[]'::jsonb),
    'por_mes', coalesce((select jsonb_agg(m order by (m->>'mes')) from (
        select jsonb_build_object('mes', to_char(spent_at, 'YYYY-MM'), 'total', sum(neto)) as m
        from scoped group by to_char(spent_at, 'YYYY-MM')) y), '[]'::jsonb)
  ) into v from scoped;
  return v;
end $function$;

-- ---------- 5. payables_summary (CxP a mayoristas, DEFINER, scope agencia) ----
-- Debo al mayorista dueño = Σ (total − comisión) de las reventas confirmadas/
-- pagadas que le vendí; pagado = Σ mis egresos category='mayorista' a ese dueño.
create or replace function ketzal.payables_summary()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb; v_sup uuid := ketzal.my_supplier_id();
begin
  if v_sup is null then
    return jsonb_build_object('total_debo', 0, 'total_pagado', 0, 'total_saldo', 0, 'lista', '[]'::jsonb);
  end if;

  with ventas as (
    select b.owner_supplier_id as owner_id, b.total,
      round(b.total * coalesce((select commission_rate from ketzal.suppliers o where o.id = b.owner_supplier_id), 0) / 100.0, 2) as comision
    from ketzal.bookings b
    where b.selling_supplier_id = v_sup
      and b.owner_supplier_id <> b.selling_supplier_id
      and b.status in ('confirmed','paid')
  ),
  debo as (
    select owner_id, count(*) as num_ventas, sum(total) as vendido, sum(comision) as comision,
           sum(total - comision) as debo
    from ventas group by owner_id
  ),
  pagos as (
    select provider_supplier_id as owner_id,
           sum(case when kind = 'egreso' then amount_mxn else -amount_mxn end) as pagado
    from ketzal.expenses
    where supplier_id = v_sup and category = 'mayorista' and provider_supplier_id is not null
    group by provider_supplier_id
  ),
  merged as (
    select d.owner_id,
           (select name from ketzal.suppliers o where o.id = d.owner_id) as owner,
           d.num_ventas, d.vendido, d.comision, d.debo,
           coalesce(p.pagado, 0) as pagado, d.debo - coalesce(p.pagado, 0) as saldo
    from debo d left join pagos p on p.owner_id = d.owner_id
  )
  select jsonb_build_object(
    'total_debo', coalesce(sum(debo), 0),
    'total_pagado', coalesce(sum(pagado), 0),
    'total_saldo', coalesce(sum(saldo), 0),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'owner_id', owner_id, 'owner', owner, 'num_ventas', num_ventas, 'vendido', vendido,
      'comision', comision, 'debo', debo, 'pagado', pagado, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
  ) into v from merged;
  return v;
end $function$;

revoke all on function ketzal.expenses_summary(date, date) from public, anon;
grant execute on function ketzal.expenses_summary(date, date) to authenticated;
revoke all on function ketzal.payables_summary() from public, anon;
grant execute on function ketzal.payables_summary() to authenticated;

-- ---------- 6. verificar_invariantes: +2 checks de gastos (aditivo) ----------
-- Re-apply desde el DDL vivo (5 checks incl. folio_cot_duplicado de F1),
-- agregando gasto_reverso_incoherente y gasto_doble_reverso.
create or replace function ketzal.verificar_invariantes()
 returns jsonb
 language plpgsql
 stable security definer
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
    from ketzal.bookings b
    where round(b.total, 2) <> round(b.subtotal - b.discount, 2)

    union all
    select 'subtotal_vs_lineas', b.id::text,
           format('subtotal %s <> suma de líneas %s', b.subtotal, coalesce(li.s, 0))
    from ketzal.bookings b
    left join (select booking_id, sum(line_total) s from ketzal.booking_items group by booking_id) li
      on li.booking_id = b.id
    where round(b.subtotal, 2) <> round(coalesce(li.s, 0), 2)

    union all
    select 'plan_suma_vs_total', b.id::text,
           format('plan suma %s <> total %s', ps.s, b.total)
    from ketzal.bookings b
    join (select booking_id, sum(amount) s from ketzal.payment_schedule group by booking_id) ps
      on ps.booking_id = b.id
    where b.payment_type = 'abonos' and round(ps.s, 2) <> round(b.total, 2)

    union all
    select 'recibo_vs_pago', r.id::text,
           format('recibo %s (folio %s) <> pago %s', r.amount, r.folio, p.amount_mxn)
    from ketzal.receipts r
    join ketzal.payments p on p.id = r.payment_id
    where r.payment_id is not null and round(r.amount, 2) <> round(p.amount_mxn, 2)

    union all
    select 'folio_cot_duplicado', min(b.id::text),
           format('folio COT %s repetido %s veces en el mismo emisor', b.quote_folio, count(*))
    from ketzal.bookings b
    where b.quote_folio is not null
    group by coalesce(b.selling_supplier_id, b.sold_by), b.quote_folio
    having count(*) > 1

    union all
    -- 6. reverso cuyo monto no cuadra con el gasto original
    select 'gasto_reverso_incoherente', e.id::text,
           format('reverso %s <> original %s', e.amount_mxn, o.amount_mxn)
    from ketzal.expenses e
    join ketzal.expenses o on o.id = e.reverses_expense_id
    where e.kind = 'reverso' and round(e.amount_mxn, 2) <> round(o.amount_mxn, 2)

    union all
    -- 7. un gasto con más de un reverso
    select 'gasto_doble_reverso', min(e.reverses_expense_id::text),
           format('gasto %s con %s reversos', e.reverses_expense_id, count(*))
    from ketzal.expenses e
    where e.reverses_expense_id is not null
    group by e.reverses_expense_id
    having count(*) > 1
  )
  select jsonb_build_object(
    'violaciones', count(*),
    'detalle', coalesce(jsonb_agg(jsonb_build_object('check', chk, 'booking_id', booking_id, 'detalle', detalle)), '[]'::jsonb)
  ) into v
  from viol;

  return v;
end $function$;
