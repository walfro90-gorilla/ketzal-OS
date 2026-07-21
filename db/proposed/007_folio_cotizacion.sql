-- 007 — Folio de cotización (COT-n) + infra de folios por serie (Plan F1).
--
-- CONTEXTO. El competidor emite cada cotización con un folio secuencial. Ketzal
-- ya folia los recibos (receipt_counters + next_receipt_folio, sin huecos por
-- agencia). Esta migración generaliza ese patrón a "series" de documentos
-- (doc_counters), asigna un folio COT-n a cada cotización (booking status
-- 'draft') al crearse, y lo conserva al convertirse en venta (trazabilidad +
-- métrica de conversión de F5).
--
-- REGLAS DE ORO respetadas:
--   #3 append-only: doc_counters lleva el trigger no_mutar (tg_ledger_inmutable)
--      + REVOKE DELETE,TRUNCATE. NO se toca receipt_counters (su propio counter).
--   #4 folio atómico por agencia: next_doc_folio clona next_receipt_folio
--      (insert on conflict do nothing + update returning; sin huecos por rollback).
--
-- Re-apply DESDE EL DDL VIVO (no del snapshot), aditivo, conservando firmas y
-- cuerpos: create_booking_with_items (INVOKER — se preserva), get_quote_by_token,
-- verificar_invariantes.

-- ---------- 1. doc_counters: counter genérico por (scope, serie) --------------
-- `supplier_id` es el SCOPE del folio: id de agencia, o —para el agente libre—
-- su auth.uid (mismo truco que emit_receipt: coalesce(supplier, uid)). Por eso
-- NO lleva FK a suppliers (un uid de usuario no es un supplier). Series usadas:
-- 'cotizacion' (esta migración) y 'voucher' (F4, futura).
create table if not exists ketzal.doc_counters (
  supplier_id uuid   not null,
  series      text   not null,
  last_folio  bigint not null default 0,
  primary key (supplier_id, series)
);

-- Blindaje: sin políticas RLS ⇒ la API (anon/authenticated) no lee ni escribe;
-- solo la función SECURITY DEFINER (que corre como dueño y salta RLS) la toca.
alter table ketzal.doc_counters enable row level security;

-- Append-only, igual que los counters de recibo (reusa el guard existente).
drop trigger if exists no_mutar on ketzal.doc_counters;
create trigger no_mutar before delete or truncate on ketzal.doc_counters
  for each statement execute function ketzal.tg_ledger_inmutable();

revoke delete, truncate on ketzal.doc_counters from anon, authenticated, service_role;

-- ---------- 2. next_doc_folio: folio atómico por (scope, serie) ---------------
-- Clon exacto de next_receipt_folio, con la dimensión `series`.
create or replace function ketzal.next_doc_folio(p_supplier uuid, p_series text)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v bigint;
begin
  insert into ketzal.doc_counters(supplier_id, series, last_folio)
  values (p_supplier, p_series, 0)
  on conflict (supplier_id, series) do nothing;

  update ketzal.doc_counters
     set last_folio = last_folio + 1
   where supplier_id = p_supplier and series = p_series
  returning last_folio into v;

  return v;
end $function$;

revoke all on function ketzal.next_doc_folio(uuid, text) from public, anon;
grant execute on function ketzal.next_doc_folio(uuid, text) to authenticated;

-- ---------- 3. bookings.quote_folio -------------------------------------------
alter table ketzal.bookings add column if not exists quote_folio bigint;

-- ---------- 4. create_booking_with_items: asigna folio en la rama draft -------
-- Re-apply aditivo del cuerpo vivo. Cambios (marcados con -- F1):
--   · declara v_quote_folio
--   · si el status es 'draft', pide next_doc_folio (scope = agencia o uid libre)
--   · agrega quote_folio al INSERT de bookings
-- Todo lo demás es idéntico al DDL vivo. Sigue siendo INVOKER (RLS del caller).
create or replace function ketzal.create_booking_with_items(p_customer_id uuid, p_new_customer jsonb, p_service_id uuid, p_travel_date date, p_discount numeric, p_notes text, p_items jsonb, p_status ketzal.booking_status)
 returns uuid
 language plpgsql
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_selling uuid := ketzal.my_supplier_id();
  v_owner uuid; v_customer uuid := p_customer_id;
  v_subtotal numeric(12,2) := 0; v_discount numeric(12,2) := round(coalesce(p_discount,0),2);
  v_total numeric(12,2); v_num_pax int := 0; v_booking uuid;
  v_status ketzal.booking_status := coalesce(p_status,'reserved');
  it jsonb; v_qty int; v_unit numeric(12,2); v_ltot numeric(12,2); v_itype text; v_ptype text;
  v_quote_folio bigint := null;  -- F1
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

  -- F1: la cotización (draft) nace foliada COT-n por scope. Transaccional: si el
  -- INSERT de abajo falla, el increment del counter se revierte (sin huecos).
  if v_status = 'draft' then
    v_quote_folio := ketzal.next_doc_folio(coalesce(v_selling, v_uid), 'cotizacion');
  end if;

  insert into ketzal.bookings(selling_supplier_id, owner_supplier_id, customer_id, service_id, sold_by,
    travel_date, num_pax, subtotal, discount, total, currency, status, notes, quote_folio)
  values (v_selling, v_owner, v_customer, p_service_id, v_uid,
    p_travel_date, v_num_pax, v_subtotal, v_discount, v_total, 'MXN', v_status,
    nullif(trim(coalesce(p_notes,'')),''), v_quote_folio)
  returning id into v_booking;

  for it in select value from jsonb_array_elements(p_items) loop
    v_itype := it->>'item_type'; v_qty := (it->>'qty')::int; v_unit := round((it->>'unit_price')::numeric,2);
    v_ltot := round(v_qty*v_unit,2);
    v_ptype := case when v_itype='passenger' then coalesce(nullif(it->>'passenger_type',''),'adult') else null end;
    insert into ketzal.booking_items(booking_id, item_type, passenger_type, description, qty, unit_price, line_total)
    values (v_booking, v_itype, v_ptype, nullif(trim(coalesce(it->>'description','')),''), v_qty, v_unit, v_ltot);
  end loop;

  return v_booking;
end $function$;

-- ---------- 5. get_quote_by_token: expone el folio (aditivo) ------------------
-- Re-apply del cuerpo vivo con una sola key nueva: 'folio'. Todo lo demás igual.
create or replace function ketzal.get_quote_by_token(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', b.id, 'folio', b.quote_folio, 'status', b.status, 'travel_date', b.travel_date, 'num_pax', b.num_pax,
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
end $function$;

-- ---------- 6. verificar_invariantes: check folio_cot_duplicado (aditivo) -----
-- Re-apply del cuerpo vivo con un check 5 nuevo. Agrupa por el SCOPE del folio
-- (coalesce(selling_supplier_id, sold_by)) para no dar falsos positivos entre
-- agentes libres distintos (todos con selling_supplier_id null).
create or replace function ketzal.verificar_invariantes()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'ketzal', 'public'
as $function$
declare v jsonb;
begin
  -- Solo superadmin (app) o service_role (cron: auth.uid() null).
  if auth.uid() is not null and not ketzal.is_superadmin() then
    raise exception 'Solo superadmin';
  end if;

  with viol as (
    -- 1. total = subtotal - descuento
    select 'total_incoherente' as chk, b.id::text as booking_id,
           format('total %s <> subtotal %s - descuento %s', b.total, b.subtotal, b.discount) as detalle
    from ketzal.bookings b
    where round(b.total, 2) <> round(b.subtotal - b.discount, 2)

    union all
    -- 2. subtotal = suma de líneas
    select 'subtotal_vs_lineas', b.id::text,
           format('subtotal %s <> suma de líneas %s', b.subtotal, coalesce(li.s, 0))
    from ketzal.bookings b
    left join (select booking_id, sum(line_total) s from ketzal.booking_items group by booking_id) li
      on li.booking_id = b.id
    where round(b.subtotal, 2) <> round(coalesce(li.s, 0), 2)

    union all
    -- 3. plan de pagos: suma de las filas = total de la venta
    select 'plan_suma_vs_total', b.id::text,
           format('plan suma %s <> total %s', ps.s, b.total)
    from ketzal.bookings b
    join (select booking_id, sum(amount) s from ketzal.payment_schedule group by booking_id) ps
      on ps.booking_id = b.id
    where b.payment_type = 'abonos' and round(ps.s, 2) <> round(b.total, 2)

    union all
    -- 4. recibo = monto de su pago
    select 'recibo_vs_pago', r.id::text,
           format('recibo %s (folio %s) <> pago %s', r.amount, r.folio, p.amount_mxn)
    from ketzal.receipts r
    join ketzal.payments p on p.id = r.payment_id
    where r.payment_id is not null and round(r.amount, 2) <> round(p.amount_mxn, 2)

    union all
    -- 5. folio de cotización duplicado dentro del mismo emisor (F1)
    select 'folio_cot_duplicado', min(b.id::text),
           format('folio COT %s repetido %s veces en el mismo emisor', b.quote_folio, count(*))
    from ketzal.bookings b
    where b.quote_folio is not null
    group by coalesce(b.selling_supplier_id, b.sold_by), b.quote_folio
    having count(*) > 1
  )
  select jsonb_build_object(
    'violaciones', count(*),
    'detalle', coalesce(jsonb_agg(jsonb_build_object('check', chk, 'booking_id', booking_id, 'detalle', detalle)), '[]'::jsonb)
  ) into v
  from viol;

  return v;
end $function$;
