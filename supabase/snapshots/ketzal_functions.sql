-- ============================================================================
-- Ketzal OS — SNAPSHOT de funciones (RPCs) del schema `ketzal`
-- Generado 2026-07-09 via pg_get_functiondef. Supabase es la FUENTE DE VERDAD;
-- esto es un respaldo VERSIONADO para recuperacion/historial. Para un dump
-- fiel y completo (tablas, policies, tipos, grants) usar `supabase db pull`
-- (ver supabase/README.md). 39 funciones.
-- ============================================================================

CREATE OR REPLACE FUNCTION ketzal._compute_payment_plan(p_total numeric, p_start date, p_final date, p_frequency text, p_down_pct numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_down numeric; v_rest numeric; v_step interval;
  v_dates date[] := '{}'; v_d date; v_n int; v_abono numeric; v_acc numeric := 0;
  v_items jsonb := '[]'::jsonb; i int;
begin
  if p_total is null or p_total <= 0 then raise exception 'Total inválido'; end if;
  if p_frequency not in ('semanal','quincenal','mensual') then raise exception 'Frecuencia inválida'; end if;
  if p_down_pct is null or p_down_pct < 0 or p_down_pct >= 1 then raise exception 'El porcentaje de enganche debe estar entre 0 y 1'; end if;
  if p_final is null or p_final <= p_start then raise exception 'La fecha final debe ser posterior a hoy'; end if;

  v_step := case p_frequency
              when 'semanal'   then interval '7 days'
              when 'quincenal' then interval '15 days'
              else                  interval '1 month' end;

  v_d := (p_start + v_step)::date;
  while v_d <= p_final loop
    v_dates := array_append(v_dates, v_d);
    v_d := (v_d + v_step)::date;
  end loop;
  v_n := coalesce(array_length(v_dates, 1), 0);
  if v_n < 1 then
    raise exception 'La fecha final no permite abonos con esa frecuencia; elige una fecha más lejana o cobra de contado.';
  end if;

  v_down  := round(p_total * p_down_pct, 2);
  v_rest  := p_total - v_down;
  v_abono := round(v_rest / v_n, 2);

  v_items := v_items || jsonb_build_object('seq', 0, 'kind', 'enganche', 'due_date', p_start, 'amount', v_down);
  for i in 1..v_n loop
    if i < v_n then
      v_acc := v_acc + v_abono;
      v_items := v_items || jsonb_build_object('seq', i, 'kind', 'abono', 'due_date', v_dates[i], 'amount', v_abono);
    else
      v_items := v_items || jsonb_build_object('seq', i, 'kind', 'abono', 'due_date', v_dates[i], 'amount', v_rest - v_acc);
    end if;
  end loop;

  return jsonb_build_object(
    'total', p_total, 'enganche', v_down, 'resto', v_rest,
    'frecuencia', p_frequency, 'num_abonos', v_n, 'monto_abono', v_abono,
    'inicio', p_start, 'final', p_final, 'items', v_items
  );
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.assign_user_agency(p_user uuid, p_supplier uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede asignar agencias'; end if;
  if p_supplier is not null and not exists (select 1 from ketzal.suppliers s where s.id = p_supplier) then
    raise exception 'Agencia no encontrada'; end if;
  update ketzal.profiles set supplier_id = p_supplier, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.cancel_booking(p_booking_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  update ketzal.bookings
     set status = 'cancelled',
         cancel_reason = nullif(trim(coalesce(p_reason,'')), ''),
         updated_at = now()
   where id = p_booking_id and status <> 'cancelled';
  if not found then raise exception 'Venta no encontrada o ya cancelada'; end if;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.clear_payment_plan(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare v_supplier uuid; v_sold uuid;
begin
  select selling_supplier_id, sold_by into v_supplier, v_sold
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin() or v_sold = auth.uid()
          or (v_supplier is not null and v_supplier = ketzal.my_supplier_id())) then
    raise exception 'Sin acceso a esta venta';
  end if;
  delete from ketzal.payment_schedule where booking_id = p_booking_id;
  update ketzal.bookings set payment_type = 'contado', plan_frequency = null, plan_final_date = null
   where id = p_booking_id;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.cobranza()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'ketzal', 'public'
AS $function$
  with base as (
    select b.id, b.payment_type, b.plan_frequency, b.due_date, b.travel_date,
           coalesce(cu.full_name, 'Sin cliente') as cliente,
           coalesce(sv.name, 'A medida')        as servicio,
           bwb.total, bwb.paid, bwb.balance
    from ketzal.bookings b
    join ketzal.bookings_with_balance bwb on bwb.id = b.id
    left join ketzal.customers cu on cu.id = b.customer_id
    left join ketzal.services  sv on sv.id = b.service_id
    where b.status <> 'cancelled' and bwb.balance > 0
  ),
  sched as (
    select ps.booking_id,
           sum(ps.amount) filter (where ps.due_date <= current_date) as esperado_hoy
    from ketzal.payment_schedule ps
    group by ps.booking_id
  ),
  prox as (
    select distinct on (ps.booking_id) ps.booking_id, ps.due_date, ps.amount
    from ketzal.payment_schedule ps
    where ps.due_date >= current_date
    order by ps.booking_id, ps.due_date
  ),
  rows as (
    select base.*,
           p.due_date as proximo_due,
           p.amount   as proximo_monto,
           greatest(0, round(coalesce(s.esperado_hoy, 0) - base.paid, 2)) as atrasado
    from base
    left join sched s on s.booking_id = base.id
    left join prox  p on p.booking_id = base.id
  )
  select jsonb_build_object(
    'total_saldo',    coalesce(sum(balance), 0),
    'total_atrasado', coalesce(sum(atrasado), 0),
    'num_ventas',     count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'cliente', cliente, 'servicio', servicio,
        'total', total, 'pagado', paid, 'saldo', balance,
        'con_plan', payment_type = 'abonos',
        'frecuencia', plan_frequency,
        'proximo_due', proximo_due, 'proximo_monto', proximo_monto,
        'atrasado', atrasado, 'due_date', due_date, 'travel_date', travel_date)
      order by atrasado desc, proximo_due asc nulls last, travel_date asc nulls last), '[]'::jsonb)
  )
  from rows;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.commissions_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v jsonb; v_platform numeric;
begin
  select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
  v_platform := coalesce(v_platform, 0);
  select jsonb_build_object(
    'total_comision', coalesce(sum(comision), 0),
    'num', count(*),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'cliente', cliente, 'servicio', servicio, 'owner', owner_name,
      'total', total, 'rate', rate, 'comision', comision, 'status', status, 'tipo', tipo) order by created_at desc), '[]'::jsonb)
  ) into v
  from (
    select b.id, b.total, b.status, b.created_at,
      (select full_name from ketzal.customers c where c.id = b.customer_id) as cliente,
      (select name from ketzal.services s where s.id = b.service_id) as servicio,
      case when b.selling_supplier_id is null then 'Ketzal (plataforma)'
           else (select name from ketzal.suppliers o where o.id = b.owner_supplier_id) end as owner_name,
      case when b.selling_supplier_id is null then v_platform
           else coalesce((select commission_rate from ketzal.suppliers o where o.id = b.owner_supplier_id), 0) end as rate,
      round(b.total * (case when b.selling_supplier_id is null then v_platform
           else coalesce((select commission_rate from ketzal.suppliers o where o.id = b.owner_supplier_id), 0) end) / 100.0, 2) as comision,
      case when b.selling_supplier_id is null then 'libre' else 'reventa' end as tipo
    from ketzal.bookings b
    where b.status in ('reserved','confirmed','paid')
      and (b.selling_supplier_id is null or b.owner_supplier_id <> b.selling_supplier_id)
  ) x;
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.confirm_online_payment(p_intent_id uuid, p_mp_payment_id text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_intent ketzal.payment_intents; v_pay uuid; v_balance numeric;
begin
  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'intent_not_found'); end if;
  if v_intent.status = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;

  if p_status <> 'approved' then
    update ketzal.payment_intents set status = p_status, mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    return jsonb_build_object('ok', true, 'status', p_status);
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, transaction_id, paid_at, installments, current_installment)
  values (v_intent.booking_id, v_intent.supplier_id, v_intent.created_by, v_intent.amount, 'COMPLETED', 'payment',
          'mercadopago', p_mp_payment_id, now(), 1, 1)
  returning id into v_pay;

  update ketzal.payment_intents
    set status = 'approved', mp_payment_id = p_mp_payment_id, payment_id = v_pay, updated_at = now()
    where id = p_intent_id;

  select balance into v_balance from ketzal.bookings_with_balance where id = v_intent.booking_id;
  update ketzal.bookings set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status else status end
    where id = v_intent.booking_id and status not in ('cancelled','paid');

  return jsonb_build_object('ok', true, 'payment_id', v_pay, 'balance', v_balance);
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.convert_quote_to_sale(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  update ketzal.bookings set status='reserved', updated_at=now()
   where id=p_booking_id and status='draft';
  if not found then raise exception 'Cotización no encontrada o ya convertida'; end if;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.create_booking_with_items(p_customer_id uuid, p_new_customer jsonb, p_service_id uuid, p_travel_date date, p_discount numeric, p_notes text, p_items jsonb, p_status ketzal.booking_status)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_selling uuid := ketzal.my_supplier_id();
  v_owner uuid; v_customer uuid := p_customer_id;
  v_subtotal numeric(12,2) := 0; v_discount numeric(12,2) := round(coalesce(p_discount,0),2);
  v_total numeric(12,2); v_num_pax int := 0; v_booking uuid;
  v_status ketzal.booking_status := coalesce(p_status,'reserved');
  it jsonb; v_qty int; v_unit numeric(12,2); v_ltot numeric(12,2); v_itype text; v_ptype text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  if v_status not in ('reserved','draft') then raise exception 'Estado inicial inválido'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Necesita al menos una línea'; end if;

  if v_customer is not null then
    -- RLS ya limita customers a los tuyos / los de tu agencia.
    if not exists (select 1 from ketzal.customers c where c.id = v_customer) then
      raise exception 'Cliente no válido o sin acceso'; end if;
  else
    if coalesce(trim(p_new_customer->>'full_name'),'')='' then raise exception 'Falta el nombre del cliente'; end if;
    insert into ketzal.customers(supplier_id, full_name, phone, created_by)
    values (v_selling, trim(p_new_customer->>'full_name'),
            nullif(trim(coalesce(p_new_customer->>'phone','')),''), v_uid)
    returning id into v_customer;
  end if;

  v_owner := v_selling;
  if p_service_id is not null then
    select coalesce(s.supplier_id, v_selling) into v_owner from ketzal.services s where s.id = p_service_id;
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_itype := it->>'item_type';
    if v_itype not in ('passenger','room','addon','custom') then raise exception 'Tipo de línea inválido: %', v_itype; end if;
    v_qty := (it->>'qty')::int; v_unit := round((it->>'unit_price')::numeric,2);
    if v_qty < 1 then raise exception 'Cantidad inválida'; end if;
    if v_unit < 0 then raise exception 'Precio inválido'; end if;
    v_subtotal := v_subtotal + (v_qty*v_unit);
    if v_itype='passenger' then v_num_pax := v_num_pax + v_qty; end if;
  end loop;
  v_subtotal := round(v_subtotal,2); v_total := round(v_subtotal - v_discount,2);
  if v_total < 0 then raise exception 'El descuento no puede ser mayor que el subtotal'; end if;

  insert into ketzal.bookings(selling_supplier_id, owner_supplier_id, customer_id, service_id, sold_by,
    travel_date, num_pax, subtotal, discount, total, currency, status, notes)
  values (v_selling, v_owner, v_customer, p_service_id, v_uid,
    p_travel_date, v_num_pax, v_subtotal, v_discount, v_total, 'MXN', v_status,
    nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_booking;

  for it in select value from jsonb_array_elements(p_items) loop
    v_itype := it->>'item_type'; v_qty := (it->>'qty')::int; v_unit := round((it->>'unit_price')::numeric,2);
    v_ltot := round(v_qty*v_unit,2);
    v_ptype := case when v_itype='passenger' then coalesce(nullif(it->>'passenger_type',''),'adult') else null end;
    insert into ketzal.booking_items(booking_id, item_type, passenger_type, description, qty, unit_price, line_total)
    values (v_booking, v_itype, v_ptype, nullif(trim(coalesce(it->>'description','')),''), v_qty, v_unit, v_ltot);
  end loop;

  return v_booking;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.create_payment_intent(p_booking_id uuid, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_supplier uuid; v_balance numeric; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select selling_supplier_id into v_supplier from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  if round(p_amount, 2) > round(coalesce(v_balance, 0), 2) then
    raise exception 'El monto (%) excede el saldo pendiente (%).',
      round(p_amount, 2), round(coalesce(v_balance, 0), 2);
  end if;

  insert into ketzal.payment_intents(booking_id, supplier_id, created_by, amount)
  values (p_booking_id, v_supplier, v_uid, round(p_amount, 2))
  returning id into v_id;
  return v_id;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v jsonb;
begin
  with bal as (
    select b.id, b.customer_id, b.service_id, b.total, b.status, b.travel_date, b.num_pax, b.due_date, b.created_at,
      b.total - coalesce((
        select sum(case when p.type='payment' then p.amount_mxn else -p.amount_mxn end)
        from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'
      ), 0) as saldo
    from ketzal.bookings b
    where b.status <> 'cancelled'
  )
  select jsonb_build_object(
    'por_cobrar',       coalesce((select sum(saldo) from bal where status in ('reserved','confirmed') and saldo > 0), 0),
    'num_por_cobrar',   (select count(*) from bal where status in ('reserved','confirmed') and saldo > 0),
    'monto_vencido',    coalesce((select sum(saldo) from bal where status in ('reserved','confirmed') and saldo > 0 and due_date is not null and due_date < current_date), 0),
    'num_vencidas',     (select count(*) from bal where status in ('reserved','confirmed') and saldo > 0 and due_date is not null and due_date < current_date),
    'num_cotizaciones', (select count(*) from bal where status = 'draft'),
    'total_vendido',    coalesce((select sum(total) from bal where status in ('reserved','confirmed','paid')), 0),
    'num_ventas',       (select count(*) from bal where status in ('reserved','confirmed','paid')),
    'ventas_saldo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'cliente', (select full_name from ketzal.customers c where c.id = x.customer_id),
        'servicio', (select name from ketzal.services s where s.id = x.service_id),
        'total', x.total, 'saldo', x.saldo, 'status', x.status,
        'due_date', x.due_date,
        'vencida', (x.due_date is not null and x.due_date < current_date))
        order by (x.due_date is null), x.due_date)
      from (select * from bal where status in ('reserved','confirmed') and saldo > 0 order by (due_date is null), due_date limit 30) x), '[]'::jsonb),
    'proximos_viajes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', y.id,
        'cliente', (select full_name from ketzal.customers c where c.id = y.customer_id),
        'servicio', (select name from ketzal.services s where s.id = y.service_id),
        'travel_date', y.travel_date, 'num_pax', y.num_pax, 'status', y.status)
        order by y.travel_date)
      from (select * from bal where travel_date >= current_date and status in ('reserved','confirmed','paid') order by travel_date limit 25) y), '[]'::jsonb)
  ) into v;
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.emit_receipt(p_payment_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_supplier uuid; v_booking uuid; v_amount numeric; v_folio bigint; v_scope uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select supplier_id, booking_id, amount_mxn into v_supplier, v_booking, v_amount
  from ketzal.payments where id = p_payment_id;
  if v_booking is null then raise exception 'Abono no encontrado o sin acceso'; end if;
  if exists (select 1 from ketzal.receipts where payment_id = p_payment_id) then
    raise exception 'Este abono ya tiene recibo'; end if;
  v_scope := coalesce(v_supplier, v_uid);
  v_folio := ketzal.next_receipt_folio(v_scope);
  insert into ketzal.receipts(supplier_id, booking_id, payment_id, folio, amount, issued_by)
  values (v_supplier, v_booking, p_payment_id, v_folio, v_amount, v_uid);
  return v_folio;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.ensure_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  insert into ketzal.profiles (id, email, name)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1))
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.ensure_statement_token(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'ketzal', 'public'
AS $function$
  update ketzal.bookings
     set statement_token = coalesce(statement_token, gen_random_uuid())
   where id = p_booking_id
     and status <> 'draft'
  returning statement_token;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.generate_payment_plan(p_booking_id uuid, p_frequency text, p_final_date date DEFAULT NULL::date, p_down_pct numeric DEFAULT 0.20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare v_total numeric; v_travel date; v_supplier uuid; v_sold uuid; v_final date; v_plan jsonb; v_item jsonb;
begin
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación'; end if;
  select total, travel_date, selling_supplier_id, sold_by
    into v_total, v_travel, v_supplier, v_sold
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin() or v_sold = auth.uid()
          or (v_supplier is not null and v_supplier = ketzal.my_supplier_id())) then
    raise exception 'Sin acceso a esta venta';
  end if;

  v_final := coalesce(p_final_date, v_travel);
  if v_final is null then raise exception 'Define una fecha final (esta venta no tiene fecha de viaje).'; end if;

  v_plan := ketzal._compute_payment_plan(v_total, current_date, v_final, p_frequency, p_down_pct);

  delete from ketzal.payment_schedule where booking_id = p_booking_id;
  for v_item in select value from jsonb_array_elements(v_plan->'items') loop
    insert into ketzal.payment_schedule(booking_id, supplier_id, seq, kind, due_date, amount)
    values (p_booking_id, v_supplier, (v_item->>'seq')::int, v_item->>'kind',
            (v_item->>'due_date')::date, (v_item->>'amount')::numeric);
  end loop;

  update ketzal.bookings
     set payment_type = 'abonos', plan_frequency = p_frequency, plan_final_date = v_final
   where id = p_booking_id;
  return v_plan;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.get_quote_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'travel_date', b.travel_date, 'num_pax', b.num_pax,
    'subtotal', b.subtotal, 'discount', b.discount, 'total', b.total, 'currency', b.currency, 'created_at', b.created_at,
    'agency', jsonb_build_object(
      'name', coalesce(s.name, 'Ketzal'),
      'contact_email', s.contact_email, 'phone', s.phone_number, 'logo', s.img_logo),
    'customer', jsonb_build_object('full_name', c.full_name),
    'service', case when sv.id is not null
                    then jsonb_build_object('name', sv.name, 'itinerary', coalesce(sv.itinerary, '[]'::jsonb))
                    else null end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_type',bi.item_type,'passenger_type',bi.passenger_type,
              'description',bi.description,'qty',bi.qty,'unit_price',bi.unit_price,'line_total',bi.line_total)
              order by bi.created_at) from ketzal.booking_items bi where bi.booking_id=b.id), '[]'::jsonb),
    -- Plan de pagos (null si es de contado o sin plan).
    'plan', case when b.payment_type = 'abonos' then jsonb_build_object(
      'frequency', b.plan_frequency,
      'final_date', b.plan_final_date,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                  'seq', ps.seq, 'kind', ps.kind, 'due_date', ps.due_date, 'amount', ps.amount)
                  order by ps.seq)
                from ketzal.payment_schedule ps where ps.booking_id = b.id), '[]'::jsonb)
    ) else null end)
  into v
  from ketzal.bookings b
  left join ketzal.suppliers s on s.id = b.selling_supplier_id
  join ketzal.customers c on c.id = b.customer_id
  left join ketzal.services sv on sv.id = b.service_id
  where b.quote_token = p_token;
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.get_receipt_public(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
  select jsonb_build_object(
    'agencia',  coalesce(s.name, 'Ketzal'),
    'logo',     s.img_logo,
    'email',    s.contact_email,
    'telefono', s.phone_number,
    'folio',    r.folio,
    'fecha',    r.issued_at,
    'cliente',  c.full_name,
    'concepto', coalesce(srv.name, 'Venta de viaje'),
    'metodo',   pay.payment_method,
    'tipo',     pay.type,
    'monto',    r.amount,
    'total',    b.total,
    'pagado',   bwb.paid,
    'saldo',    bwb.balance,
    'moneda',   coalesce(b.currency, 'MXN')
  )
  from ketzal.receipts r
  join ketzal.bookings b               on b.id   = r.booking_id
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.customers c   on c.id   = b.customer_id
  left join ketzal.services  srv on srv.id = b.service_id
  left join ketzal.suppliers s   on s.id   = r.supplier_id
  left join ketzal.payments  pay on pay.id = r.payment_id
  where r.id = p_receipt_id;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.get_statement_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
  select jsonb_build_object(
    'agencia',     coalesce(s.name, 'Ketzal'),
    'logo',        s.img_logo,
    'folio',       coalesce(nullif(b.folio, ''), left(b.id::text, 8)),
    'cliente',     c.full_name,
    'servicio',    srv.name,
    'fecha_viaje', b.travel_date,
    'pasajeros',   b.num_pax,
    'estado',      b.status,
    'moneda',      coalesce(b.currency, 'MXN'),
    'total',       b.total,
    'pagado',      bwb.paid,
    'saldo',       bwb.balance,
    'due_date',    b.due_date,
    'emitido',     now(),
    'abonos', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'fecha',  coalesce(p.paid_at, p.created_at),
                 'monto',  p.amount_mxn,
                 'metodo', p.payment_method,
                 'tipo',   p.type
               )
               order by coalesce(p.paid_at, p.created_at)
             )
        from ketzal.payments p
       where p.booking_id = b.id
         and p.status = 'COMPLETED'::ketzal.payment_status
    ), '[]'::jsonb)
  )
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.customers c   on c.id   = b.customer_id
  left join ketzal.services  srv on srv.id = b.service_id
  left join ketzal.suppliers s   on s.id   = b.selling_supplier_id
  where b.statement_token = p_token
    and b.status <> 'draft';
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.global_search(p_q text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_pat text := '%' || lower(btrim(coalesce(p_q, ''))) || '%';
  v jsonb;
begin
  if length(btrim(coalesce(p_q, ''))) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(r order by ord, label), '[]'::jsonb) into v
  from (
    (select 0 as ord, c.full_name as label,
            jsonb_build_object(
              'type', 'cliente', 'id', c.id, 'label', c.full_name,
              'sublabel', coalesce(nullif(c.phone, ''), nullif(c.email, ''), 'Cliente'),
              'href', '/clientes/' || c.id) as r
     from ketzal.customers c
     where lower(c.full_name) like v_pat
        or lower(coalesce(c.phone, '')) like v_pat
        or lower(coalesce(c.email, '')) like v_pat
     limit 6)

    union all

    (select 1 as ord, coalesce(cu.full_name, 'Venta') as label,
            jsonb_build_object(
              'type', 'venta', 'id', b.id, 'label', coalesce(cu.full_name, 'Venta'),
              'sublabel', coalesce(s.name, 'A medida') || ' · ' ||
                          coalesce(nullif(b.folio, ''), left(b.id::text, 8)),
              'href', '/ventas/' || b.id) as r
     from ketzal.bookings b
     left join ketzal.customers cu on cu.id = b.customer_id
     left join ketzal.services  s  on s.id  = b.service_id
     where b.status <> 'draft'
       and (lower(coalesce(cu.full_name, '')) like v_pat
         or lower(coalesce(s.name, '')) like v_pat
         or lower(coalesce(b.folio, '')) like v_pat)
     limit 6)

    union all

    (select 2 as ord, s.name as label,
            jsonb_build_object(
              'type', 'servicio', 'id', s.id, 'label', s.name,
              'sublabel', coalesce(nullif(s.city_to, ''), nullif(s.location, ''), 'Servicio'),
              'href', '/servicios/' || s.id) as r
     from ketzal.services s
     where lower(s.name) like v_pat
        or lower(coalesce(s.city_to, '')) like v_pat
     limit 6)
  ) t(ord, label, r);

  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
  select coalesce((select active from ketzal.profiles where id = auth.uid()), false)
         or ketzal.is_superadmin()
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
  select exists (select 1 from ketzal.profiles where id = auth.uid() and role = 'superadmin');
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.list_customers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v jsonb;
begin
  select coalesce(jsonb_agg(r.obj order by r.full_name), '[]'::jsonb) into v
  from (
    select c.full_name,
      jsonb_build_object(
        'id', c.id,
        'full_name', c.full_name,
        'phone', c.phone,
        'email', c.email,
        'created_at', c.created_at,
        'num_ventas', (select count(*) from ketzal.bookings b
                        where b.customer_id = c.id and b.status in ('reserved','confirmed','paid')),
        'total_comprado', coalesce((select sum(b.total) from ketzal.bookings b
                        where b.customer_id = c.id and b.status in ('reserved','confirmed','paid')), 0),
        'ultima_venta', (select max(b.created_at) from ketzal.bookings b
                        where b.customer_id = c.id and b.status <> 'draft')
      ) as obj
    from ketzal.customers c
  ) r;
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.list_team()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'role', p.role, 'active', p.active,
    'supplier_id', p.supplier_id,
    'agency', (select name from ketzal.suppliers s where s.id = p.supplier_id),
    'num_ventas', (select count(*) from ketzal.bookings b
                    where b.sold_by = p.id and b.status in ('reserved','confirmed','paid'))
  ) order by p.active asc, p.email asc), '[]'::jsonb) into v
  from ketzal.profiles p
  where v_super or (p.supplier_id is not null and p.supplier_id = v_sup);
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.my_supplier_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
  select supplier_id from ketzal.profiles where id = auth.uid();
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.next_receipt_folio(p_supplier uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v bigint;
begin
  insert into ketzal.receipt_counters(supplier_id, last_folio)
  values (p_supplier, 0)
  on conflict (supplier_id) do nothing;

  update ketzal.receipt_counters
     set last_folio = last_folio + 1
   where supplier_id = p_supplier
  returning last_folio into v;

  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.notification_create_self(p_title text, p_message text, p_type ketzal.notification_type DEFAULT 'INFO'::ketzal.notification_type, p_priority ketzal.notification_priority DEFAULT 'NORMAL'::ketzal.notification_priority, p_metadata jsonb DEFAULT NULL::jsonb, p_action_url text DEFAULT NULL::text)
 RETURNS ketzal.notifications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row ketzal.notifications;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Titulo requerido';
  end if;
  insert into ketzal.notifications (user_id, title, message, type, priority, metadata, action_url)
  values (v_user_id, p_title, p_message, p_type, p_priority, p_metadata, p_action_url)
  returning * into v_row;
  return v_row;
end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.preview_payment_plan(p_total numeric, p_final date, p_frequency text, p_down_pct numeric DEFAULT 0.20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'ketzal', 'public'
AS $function$ select ketzal._compute_payment_plan(p_total, current_date, p_final, p_frequency, p_down_pct); $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.register_payment(p_booking_id uuid, p_amount numeric, p_method text, p_paid_at timestamp with time zone, p_type ketzal.payment_type)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_supplier uuid; v_balance numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select selling_supplier_id into v_supplier from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment)
  values (p_booking_id, v_supplier, v_uid, round(p_amount,2), 'COMPLETED', coalesce(p_type,'payment'),
          nullif(trim(coalesce(p_method,'')),''), coalesce(p_paid_at, now()), 1, 1);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status else status end
   where id = p_booking_id and status <> 'cancelled';
  return v_balance;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.reports_summary(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
  v_uid uuid := auth.uid();
  v_platform numeric;
begin
  select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
  v_platform := coalesce(v_platform, 0);

  with scoped as (
    select b.id, b.total, b.sold_by, b.service_id, b.created_at,
      case
        when b.selling_supplier_id is null then round(b.total * v_platform / 100.0, 2)
        when b.owner_supplier_id is not null and b.owner_supplier_id <> b.selling_supplier_id
          then round(b.total * coalesce((select commission_rate from ketzal.suppliers o where o.id = b.owner_supplier_id), 0) / 100.0, 2)
        else 0
      end as comision,
      coalesce((select sum(case when p.type = 'payment' then p.amount_mxn else -p.amount_mxn end)
                from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'), 0) as cobrado
    from ketzal.bookings b
    where b.status in ('reserved','confirmed','paid')
      and b.created_at >= p_from
      and b.created_at < (p_to + 1)
      and (v_super
           or (v_sup is not null and b.selling_supplier_id = v_sup)
           or b.sold_by = v_uid)
  )
  select jsonb_build_object(
    'total_vendido',     coalesce(sum(total), 0),
    'total_cobrado',     coalesce(sum(cobrado), 0),
    'saldo_por_cobrar',  coalesce(sum(total), 0) - coalesce(sum(cobrado), 0),
    'total_comision',    coalesce(sum(comision), 0),
    'num_ventas',        count(*),
    'ticket_promedio',   case when count(*) > 0 then round(coalesce(sum(total), 0) / count(*), 2) else 0 end,
    'por_agente', coalesce((select jsonb_agg(a order by (a->>'vendido')::numeric desc) from (
        select jsonb_build_object(
          'agente', coalesce((select coalesce(pr.name, pr.email) from ketzal.profiles pr where pr.id = s.sold_by), '—'),
          'num', count(*), 'vendido', sum(s.total), 'comision', sum(s.comision)) as a
        from scoped s group by s.sold_by) x), '[]'::jsonb),
    'por_servicio', coalesce((select jsonb_agg(sv order by (sv->>'vendido')::numeric desc) from (
        select jsonb_build_object(
          'servicio', coalesce((select se.name from ketzal.services se where se.id = s.service_id), 'A medida'),
          'num', count(*), 'vendido', sum(s.total)) as sv
        from scoped s group by s.service_id) y), '[]'::jsonb),
    'por_mes', coalesce((select jsonb_agg(m order by (m->>'mes')) from (
        select jsonb_build_object('mes', to_char(s.created_at, 'YYYY-MM'), 'num', count(*), 'vendido', sum(s.total)) as m
        from scoped s group by to_char(s.created_at, 'YYYY-MM')) z), '[]'::jsonb)
  ) into v from scoped;
  return v;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at := now(); return new; end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.set_user_active(p_user uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  if not ketzal.is_superadmin() then
    if not exists (
      select 1 from ketzal.profiles me
      join ketzal.profiles t on t.id = p_user
      where me.id = auth.uid() and me.role = 'admin' and me.supplier_id is not null
        and t.supplier_id = me.supplier_id
    ) then raise exception 'No autorizado'; end if;
  end if;
  update ketzal.profiles set active = p_active, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.set_user_role(p_user uuid, p_role ketzal.user_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede cambiar roles'; end if;
  update ketzal.profiles set role = p_role, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.tg_booking_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_hit uuid;
begin
  -- ¿la venta pasa a 'reserved' (alta directa o cotización convertida)? → consumir
  if new.service_id is not null
     and new.status = 'reserved'
     and ( tg_op = 'INSERT' or old.status is distinct from 'reserved' ) then
    -- enforcement solo si el proveedor ya declaró salidas para el servicio
    if exists ( select 1 from ketzal.service_departures d
                 where d.service_id = new.service_id ) then
      if new.travel_date is null then
        raise exception 'Selecciona la fecha de salida: este servicio se vende por cupo.';
      end if;
      update ketzal.service_departures
         set seats_taken = seats_taken + new.num_pax
       where service_id = new.service_id
         and departs_on = new.travel_date
         and seats_taken + new.num_pax <= max_capacity
      returning id into v_hit;
      if v_hit is null then
        if exists ( select 1 from ketzal.service_departures d
                     where d.service_id = new.service_id
                       and d.departs_on = new.travel_date ) then
          raise exception 'Sin cupo: la salida del % ya no tiene lugares suficientes.', new.travel_date;
        else
          raise exception 'No hay salida programada para el %. Da de alta la salida y su cupo.', new.travel_date;
        end if;
      end if;
    end if;
  end if;

  -- ¿se cancela una venta que ya tenía cupo tomado? → reponer
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status in ('reserved','confirmed','paid')
     and old.service_id is not null
     and old.travel_date is not null then
    update ketzal.service_departures
       set seats_taken = greatest(0, seats_taken - old.num_pax)
     where service_id = old.service_id
       and departs_on = old.travel_date;
  end if;

  return new;
end
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
begin new.updated_at = now(); return new; end $function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.wallet_add_funds(p_amount_mxn numeric DEFAULT 0, p_amount_axo numeric DEFAULT 0, p_description text DEFAULT 'Deposito'::text, p_reference text DEFAULT NULL::text, p_type ketzal.wallet_txn_type DEFAULT 'DEPOSIT'::ketzal.wallet_txn_type)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet ketzal.wallets;
  v_txn_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'No autenticado');
  end if;
  if p_amount_mxn < 0 or p_amount_axo < 0 then
    return jsonb_build_object('success', false, 'message', 'Montos deben ser positivos');
  end if;
  if p_amount_mxn = 0 and p_amount_axo = 0 then
    return jsonb_build_object('success', false, 'message', 'Monto cero');
  end if;

  perform ketzal.wallet_ensure(v_user_id);
  select * into v_wallet from ketzal.wallets where user_id = v_user_id for update;

  update ketzal.wallets
  set balance_mxn = balance_mxn + p_amount_mxn,
      balance_axo = balance_axo + p_amount_axo,
      updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into ketzal.wallet_transactions (wallet_id, type, amount_mxn, amount_axo, description, reference)
  values (v_wallet.id, p_type, nullif(p_amount_mxn, 0), nullif(p_amount_axo, 0), p_description, p_reference)
  returning id into v_txn_id;

  return jsonb_build_object(
    'success', true,
    'wallet', row_to_json(v_wallet),
    'transactionId', v_txn_id
  );
end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.wallet_convert(p_from_currency text, p_amount numeric, p_rate numeric, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet ketzal.wallets;
  v_desc text := coalesce(p_description, 'Conversion ' || p_from_currency || ' -> ' || (case when p_from_currency='MXN' then 'AXO' else 'MXN' end));
  v_txn_id uuid;
  v_amt_mxn numeric;
  v_amt_axo numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'No autenticado');
  end if;
  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'message', 'Monto debe ser positivo');
  end if;
  if p_rate <= 0 then
    return jsonb_build_object('success', false, 'message', 'Tasa debe ser positiva');
  end if;
  if p_from_currency not in ('MXN', 'AXO') then
    return jsonb_build_object('success', false, 'message', 'p_from_currency debe ser MXN o AXO');
  end if;

  perform ketzal.wallet_ensure(v_user_id);
  select * into v_wallet from ketzal.wallets where user_id = v_user_id for update;

  if p_from_currency = 'MXN' then
    if v_wallet.balance_mxn < p_amount then
      return jsonb_build_object('success', false, 'message', 'Saldo MXN insuficiente');
    end if;
    v_amt_mxn := -p_amount;
    v_amt_axo := p_amount * p_rate;
    update ketzal.wallets
    set balance_mxn = balance_mxn - p_amount,
        balance_axo = balance_axo + (p_amount * p_rate),
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  else -- AXO
    if v_wallet.balance_axo < p_amount then
      return jsonb_build_object('success', false, 'message', 'Saldo AXO insuficiente');
    end if;
    v_amt_axo := -p_amount;
    v_amt_mxn := p_amount * p_rate;
    update ketzal.wallets
    set balance_axo = balance_axo - p_amount,
        balance_mxn = balance_mxn + (p_amount * p_rate),
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  end if;

  insert into ketzal.wallet_transactions (wallet_id, type, amount_mxn, amount_axo, description)
  values (v_wallet.id, 'PURCHASE', v_amt_mxn, v_amt_axo, v_desc)
  returning id into v_txn_id;

  return jsonb_build_object(
    'success', true,
    'wallet', row_to_json(v_wallet),
    'transactionId', v_txn_id
  );
end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.wallet_ensure(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS ketzal.wallets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_wallet ketzal.wallets;
begin
  if v_user_id is null then
    raise exception 'wallet_ensure: sin user_id ni auth.uid';
  end if;
  select * into v_wallet from ketzal.wallets where user_id = v_user_id;
  if not found then
    insert into ketzal.wallets (user_id, balance_mxn, balance_axo)
    values (v_user_id, 0, 0)
    returning * into v_wallet;
  end if;
  return v_wallet;
end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.wallet_purchase(p_amount_mxn numeric DEFAULT 0, p_amount_axo numeric DEFAULT 0, p_description text DEFAULT 'Compra'::text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_wallet ketzal.wallets;
  v_txn_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'No autenticado');
  end if;
  if p_amount_mxn < 0 or p_amount_axo < 0 then
    return jsonb_build_object('success', false, 'message', 'Montos deben ser positivos');
  end if;
  if p_amount_mxn = 0 and p_amount_axo = 0 then
    return jsonb_build_object('success', false, 'message', 'Monto cero');
  end if;

  perform ketzal.wallet_ensure(v_user_id);
  select * into v_wallet from ketzal.wallets where user_id = v_user_id for update;

  if v_wallet.balance_mxn < p_amount_mxn or v_wallet.balance_axo < p_amount_axo then
    return jsonb_build_object('success', false, 'message', 'Saldo insuficiente');
  end if;

  update ketzal.wallets
  set balance_mxn = balance_mxn - p_amount_mxn,
      balance_axo = balance_axo - p_amount_axo,
      updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into ketzal.wallet_transactions (wallet_id, type, amount_mxn, amount_axo, description, reference)
  values (v_wallet.id, 'PURCHASE', nullif(p_amount_mxn, 0), nullif(p_amount_axo, 0), p_description, p_reference)
  returning id into v_txn_id;

  return jsonb_build_object(
    'success', true,
    'wallet', row_to_json(v_wallet),
    'transactionId', v_txn_id
  );
end;
$function$
;

-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ketzal.wallet_transfer(p_to_user_id uuid, p_amount_mxn numeric DEFAULT 0, p_amount_axo numeric DEFAULT 0, p_description text DEFAULT 'Transferencia'::text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'public'
AS $function$
declare
  v_from_user uuid := auth.uid();
  v_from_wallet ketzal.wallets;
  v_to_wallet ketzal.wallets;
  v_first uuid;
  v_second uuid;
begin
  if v_from_user is null then
    return jsonb_build_object('success', false, 'message', 'No autenticado');
  end if;
  if p_to_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Destino requerido');
  end if;
  if p_to_user_id = v_from_user then
    return jsonb_build_object('success', false, 'message', 'No se puede transferir a si mismo');
  end if;
  if p_amount_mxn < 0 or p_amount_axo < 0 then
    return jsonb_build_object('success', false, 'message', 'Montos deben ser positivos');
  end if;
  if p_amount_mxn = 0 and p_amount_axo = 0 then
    return jsonb_build_object('success', false, 'message', 'Monto cero');
  end if;

  perform ketzal.wallet_ensure(v_from_user);
  perform ketzal.wallet_ensure(p_to_user_id);

  -- Lock en orden determinista por user_id::text (anti-deadlock).
  if v_from_user::text < p_to_user_id::text then
    v_first := v_from_user;
    v_second := p_to_user_id;
  else
    v_first := p_to_user_id;
    v_second := v_from_user;
  end if;
  perform 1 from ketzal.wallets where user_id = v_first for update;
  perform 1 from ketzal.wallets where user_id = v_second for update;

  select * into v_from_wallet from ketzal.wallets where user_id = v_from_user;
  select * into v_to_wallet from ketzal.wallets where user_id = p_to_user_id;

  if v_from_wallet.balance_mxn < p_amount_mxn or v_from_wallet.balance_axo < p_amount_axo then
    return jsonb_build_object('success', false, 'message', 'Saldo insuficiente');
  end if;

  update ketzal.wallets
  set balance_mxn = balance_mxn - p_amount_mxn,
      balance_axo = balance_axo - p_amount_axo,
      updated_at = now()
  where id = v_from_wallet.id
  returning * into v_from_wallet;

  update ketzal.wallets
  set balance_mxn = balance_mxn + p_amount_mxn,
      balance_axo = balance_axo + p_amount_axo,
      updated_at = now()
  where id = v_to_wallet.id
  returning * into v_to_wallet;

  insert into ketzal.wallet_transactions (wallet_id, type, amount_mxn, amount_axo, description, reference)
  values
    (v_from_wallet.id, 'TRANSFER_SENT',     nullif(p_amount_mxn, 0), nullif(p_amount_axo, 0), p_description, p_reference),
    (v_to_wallet.id,   'TRANSFER_RECEIVED', nullif(p_amount_mxn, 0), nullif(p_amount_axo, 0), p_description, p_reference);

  return jsonb_build_object('success', true, 'wallet', row_to_json(v_from_wallet));
end;
$function$
;
