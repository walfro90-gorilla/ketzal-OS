


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "ketzal";


ALTER SCHEMA "ketzal" OWNER TO "postgres";


CREATE TYPE "ketzal"."booking_status" AS ENUM (
    'draft',
    'reserved',
    'confirmed',
    'paid',
    'cancelled'
);


ALTER TYPE "ketzal"."booking_status" OWNER TO "postgres";


CREATE TYPE "ketzal"."notification_priority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
);


ALTER TYPE "ketzal"."notification_priority" OWNER TO "postgres";


CREATE TYPE "ketzal"."notification_type" AS ENUM (
    'INFO',
    'SUCCESS',
    'WARNING',
    'ERROR',
    'SUPPLIER_APPROVAL',
    'USER_REGISTRATION',
    'WELCOME_BONUS',
    'WELCOME_MESSAGE',
    'BOOKING_UPDATE',
    'SYSTEM_UPDATE'
);


ALTER TYPE "ketzal"."notification_type" OWNER TO "postgres";


CREATE TYPE "ketzal"."payment_status" AS ENUM (
    'PENDING',
    'PARTIAL',
    'COMPLETED',
    'REFUNDED'
);


ALTER TYPE "ketzal"."payment_status" OWNER TO "postgres";


CREATE TYPE "ketzal"."payment_type" AS ENUM (
    'payment',
    'refund'
);


ALTER TYPE "ketzal"."payment_type" OWNER TO "postgres";


CREATE TYPE "ketzal"."planner_status" AS ENUM (
    'PLANNING',
    'RESERVED',
    'CONFIRMED',
    'TRAVELLING',
    'COMPLETED'
);


ALTER TYPE "ketzal"."planner_status" OWNER TO "postgres";


CREATE TYPE "ketzal"."user_role" AS ENUM (
    'user',
    'admin',
    'superadmin'
);


ALTER TYPE "ketzal"."user_role" OWNER TO "postgres";


CREATE TYPE "ketzal"."wallet_txn_type" AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'PURCHASE',
    'REFUND',
    'TRANSFER_SENT',
    'TRANSFER_RECEIVED',
    'REWARD'
);


ALTER TYPE "ketzal"."wallet_txn_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."_compute_payment_plan"("p_total" numeric, "p_start" "date", "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."_compute_payment_plan"("p_total" numeric, "p_start" "date", "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."agency_name"("p_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select name from ketzal.suppliers where id = p_id and supplier_type = 'agency';
$$;


ALTER FUNCTION "ketzal"."agency_name"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede asignar agencias'; end if;
  if p_supplier is not null and not exists (select 1 from ketzal.suppliers s where s.id = p_supplier) then
    raise exception 'Agencia no encontrada'; end if;
  update ketzal.profiles set supplier_id = p_supplier, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;


ALTER FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  update ketzal.bookings
     set status = 'cancelled',
         cancel_reason = nullif(trim(coalesce(p_reason,'')), ''),
         updated_at = now()
   where id = p_booking_id and status <> 'cancelled';
  if not found then raise exception 'Venta no encontrada o ya cancelada'; end if;
end $$;


ALTER FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_bandeja"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'title', r.title, 'message', r.message, 'phone', r.phone,
    'booking_id', r.booking_id, 'cliente', c.full_name, 'servicio', coalesce(sv.name,'A medida'),
    'created_at', r.created_at)
    order by case r.kind when 'abono_vencido' then 0 when 'abono_por_vencer' then 1
                         when 'viaje_proximo' then 2 else 3 end, r.created_at desc), '[]'::jsonb)
  from ketzal.clawbot_reminders r
  left join ketzal.customers c  on c.id = r.customer_id
  left join ketzal.bookings  b  on b.id = r.booking_id
  left join ketzal.services  sv on sv.id = b.service_id
  where r.status = 'pendiente';
$$;


ALTER FUNCTION "ketzal"."clawbot_bandeja"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare v_sold uuid; v_sup uuid;
begin
  select sold_by, supplier_id into v_sold, v_sup from ketzal.clawbot_reminders where id = p_id;
  if not found then raise exception 'Recordatorio no encontrado'; end if;
  if not (ketzal.is_superadmin() or v_sold = auth.uid() or (v_sup is not null and v_sup = ketzal.my_supplier_id())) then
    raise exception 'Sin acceso'; end if;
  update ketzal.clawbot_reminders set status='descartado' where id = p_id;
end $$;


ALTER FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_generar_recordatorios"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $_$
declare v_pend integer;
begin
  drop table if exists _cb;
  create temp table _cb on commit drop as
  select b.id as booking_id, b.customer_id, b.selling_supplier_id as supplier_id, b.sold_by,
         b.status::text as status, b.payment_type, b.travel_date, b.created_at,
         c.full_name as cliente, c.phone,
         coalesce(sv.name, 'tu viaje') as servicio,
         coalesce(s.name, 'Ketzal') as agencia,
         bwb.total, bwb.paid, bwb.balance
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.customers c  on c.id  = b.customer_id
  left join ketzal.services  sv on sv.id = b.service_id
  left join ketzal.suppliers  s on s.id  = b.selling_supplier_id
  where b.status <> 'cancelled';

  -- 1) Abono por vencer (próximo pago del plan en [hoy, hoy+3], con saldo)
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, title, message, phone, dedupe_key)
  select cb.booking_id, cb.customer_id, cb.supplier_id, cb.sold_by, 'abono_por_vencer', 'Abono por vencer',
    format('Hola %s, te recordamos tu abono de $%s de tu viaje "%s" con %s, programado para el %s. Puedes pagarlo respondiendo a este mensaje. Gracias!',
      coalesce(cb.cliente,'cliente'), to_char(nx.amount,'FM999,999,990.00'), cb.servicio, cb.agencia, to_char(nx.due_date,'DD/MM/YYYY')),
    cb.phone, 'abono_por_vencer:'||cb.booking_id||':'||nx.due_date
  from _cb cb
  join lateral (select ps.due_date, ps.amount from ketzal.payment_schedule ps
                where ps.booking_id = cb.booking_id and ps.due_date >= current_date
                order by ps.due_date limit 1) nx on nx.due_date <= current_date + 3
  where cb.payment_type = 'abonos' and cb.balance > 0
  on conflict (dedupe_key) do nothing;

  -- 2) Abono vencido (atrasado vs plan: esperado_hoy - pagado > 0)
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, title, message, phone, dedupe_key)
  select cb.booking_id, cb.customer_id, cb.supplier_id, cb.sold_by, 'abono_vencido', 'Abono vencido',
    format('Hola %s, tu plan de pagos de "%s" con %s tiene $%s pendiente. Escríbenos para ponerte al corriente. Gracias!',
      coalesce(cb.cliente,'cliente'), cb.servicio, cb.agencia, to_char(atr.atrasado,'FM999,999,990.00')),
    cb.phone, 'abono_vencido:'||cb.booking_id||':'||atr.earliest
  from _cb cb
  join lateral (
    select greatest(0, round(coalesce(sum(ps.amount) filter (where ps.due_date <= current_date),0) - cb.paid, 2)) as atrasado,
           min(ps.due_date) filter (where ps.due_date < current_date) as earliest
    from ketzal.payment_schedule ps where ps.booking_id = cb.booking_id
  ) atr on atr.atrasado > 0 and atr.earliest is not null
  where cb.payment_type = 'abonos' and cb.balance > 0
  on conflict (dedupe_key) do nothing;

  -- 3) Cotización sin cerrar (draft >= 3 días) — nudge al cliente
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, title, message, phone, dedupe_key)
  select cb.booking_id, cb.customer_id, cb.supplier_id, cb.sold_by, 'cotizacion_seguimiento', 'Cotización por cerrar',
    format('Hola %s, ¿sigues interesado en tu cotización de "%s" con %s por $%s? Con gusto te ayudamos a reservar. Gracias!',
      coalesce(cb.cliente,'cliente'), cb.servicio, cb.agencia, to_char(cb.total,'FM999,999,990.00')),
    cb.phone, 'cotizacion_seguimiento:'||cb.booking_id
  from _cb cb
  where cb.status = 'draft' and cb.created_at::date <= current_date - 3
  on conflict (dedupe_key) do nothing;

  -- 4) Viaje próximo (travel_date en [hoy+1, hoy+3])
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, title, message, phone, dedupe_key)
  select cb.booking_id, cb.customer_id, cb.supplier_id, cb.sold_by, 'viaje_proximo', 'Viaje próximo',
    format('Hola %s, tu viaje "%s" con %s es el %s. Te contactamos para confirmar los detalles. ¡Nos vemos pronto!',
      coalesce(cb.cliente,'cliente'), cb.servicio, cb.agencia, to_char(cb.travel_date,'DD/MM/YYYY')),
    cb.phone, 'viaje_proximo:'||cb.booking_id||':'||cb.travel_date
  from _cb cb
  where cb.travel_date between current_date + 1 and current_date + 3
  on conflict (dedupe_key) do nothing;

  select count(*) into v_pend from ketzal.clawbot_reminders where status = 'pendiente';
  return v_pend;
end $_$;


ALTER FUNCTION "ketzal"."clawbot_generar_recordatorios"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare v_sold uuid; v_sup uuid;
begin
  select sold_by, supplier_id into v_sold, v_sup from ketzal.clawbot_reminders where id = p_id;
  if not found then raise exception 'Recordatorio no encontrado'; end if;
  if not (ketzal.is_superadmin() or v_sold = auth.uid() or (v_sup is not null and v_sup = ketzal.my_supplier_id())) then
    raise exception 'Sin acceso'; end if;
  update ketzal.clawbot_reminders set status='enviado', sent_at=now(), sent_by=auth.uid() where id = p_id;
end $$;


ALTER FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_resumen"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select jsonb_build_object(
    'total', count(*),
    'abono_vencido', count(*) filter (where kind='abono_vencido'),
    'abono_por_vencer', count(*) filter (where kind='abono_por_vencer'),
    'cotizacion_seguimiento', count(*) filter (where kind='cotizacion_seguimiento'),
    'viaje_proximo', count(*) filter (where kind='viaje_proximo'))
  from ketzal.clawbot_reminders where status='pendiente';
$$;


ALTER FUNCTION "ketzal"."clawbot_resumen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."cobranza"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."cobranza"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."commissions_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."commissions_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  update ketzal.bookings set status='reserved', updated_at=now()
   where id=p_booking_id and status='draft';
  if not found then raise exception 'Cotización no encontrada o ya convertida'; end if;
end $$;


ALTER FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."dashboard_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."dashboard_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ensure_profile"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  insert into ketzal.profiles (id, email, name)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1))
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;


ALTER FUNCTION "ketzal"."ensure_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ensure_statement_token"("p_booking_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql"
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  update ketzal.bookings
     set statement_token = coalesce(statement_token, gen_random_uuid())
   where id = p_booking_id
     and status <> 'draft'
  returning statement_token;
$$;


ALTER FUNCTION "ketzal"."ensure_statement_token"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date" DEFAULT NULL::"date", "p_down_pct" numeric DEFAULT 0.20) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date", "p_down_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_public_service"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select to_jsonb(t) from (
    select s.id, s.name, s.description, s.price, s.service_type, s.service_category,
           s.location, s.city_from, s.state_from, s.city_to, s.state_to,
           s.size_tour, s.max_capacity, s.current_bookings,
           s.images, s.yt_link, s.includes, s.excludes, s.faqs, s.itinerary,
           s.packs, s.add_ons, s.dates,
           jsonb_build_object(
             'name', sup.name, 'logo', sup.img_logo,
             'email', sup.contact_email, 'phone', sup.phone_number
           ) as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    where s.id = p_id and s.published
  ) t;
$$;


ALTER FUNCTION "ketzal"."get_public_service"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."global_search"("p_q" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  -- Escapa \ % _ del término (backslash primero) → LIKE los trata literal;
  -- los '%' externos siguen dando el match por substring.
  v_term text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_');
  v_pat text := '%' || v_term || '%';
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

    -- Cotizaciones: bookings en borrador (status = 'draft'). Detalle en /ventas/[id].
    (select 2 as ord, coalesce(cu.full_name, 'Cotización') as label,
            jsonb_build_object(
              'type', 'cotizacion', 'id', b.id, 'label', coalesce(cu.full_name, 'Cotización'),
              'sublabel', coalesce(s.name, 'A medida'),
              'href', '/ventas/' || b.id) as r
     from ketzal.bookings b
     left join ketzal.customers cu on cu.id = b.customer_id
     left join ketzal.services  s  on s.id  = b.service_id
     where b.status = 'draft'
       and (lower(coalesce(cu.full_name, '')) like v_pat
         or lower(coalesce(s.name, '')) like v_pat)
     limit 6)

    union all

    (select 3 as ord, s.name as label,
            jsonb_build_object(
              'type', 'servicio', 'id', s.id, 'label', s.name,
              'sublabel', coalesce(nullif(s.city_to, ''), nullif(s.location, ''), 'Servicio'),
              'href', '/servicios/' || s.id) as r
     from ketzal.services s
     where lower(s.name) like v_pat
        or lower(coalesce(s.city_to, '')) like v_pat
     limit 6)

    union all

    -- Proveedores: suppliers (RLS acota a los visibles para el agente).
    (select 4 as ord, sup.name as label,
            jsonb_build_object(
              'type', 'proveedor', 'id', sup.id, 'label', sup.name,
              'sublabel', coalesce(nullif(sup.contact_email, ''), nullif(sup.phone_number, ''), 'Proveedor'),
              'href', '/proveedores/' || sup.id) as r
     from ketzal.suppliers sup
     where lower(sup.name) like v_pat
        or lower(coalesce(sup.contact_email, '')) like v_pat
        or lower(coalesce(sup.phone_number, '')) like v_pat
     limit 6)
  ) t(ord, label, r);

  return v;
end $$;


ALTER FUNCTION "ketzal"."global_search"("p_q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce((select active from ketzal.profiles where id = auth.uid()), false)
         or ketzal.is_superadmin()
$$;


ALTER FUNCTION "ketzal"."is_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select exists (select 1 from ketzal.profiles where id = auth.uid() and role = 'superadmin');
$$;


ALTER FUNCTION "ketzal"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_agency_names"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from ketzal.suppliers where supplier_type = 'agency';
$$;


ALTER FUNCTION "ketzal"."list_agency_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_customers"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."list_customers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_public_services"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from (
    select s.id, s.name, s.price, s.service_type, s.service_category,
           s.city_to, s.state_to, s.location,
           s.images->>'imgBanner' as image,
           sup.name as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    where s.published
    order by s.name
  ) t;
$$;


ALTER FUNCTION "ketzal"."list_public_services"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_team"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."list_team"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  insert into ketzal.system_log(source, level, event, detail) values (p_source, p_level, p_event, p_detail);
$$;


ALTER FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_supplier_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select supplier_id from ketzal.profiles where id = auth.uid();
$$;


ALTER FUNCTION "ketzal"."my_supplier_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "ketzal"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "ketzal"."notification_type" DEFAULT 'INFO'::"ketzal"."notification_type" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "priority" "ketzal"."notification_priority" DEFAULT 'NORMAL'::"ketzal"."notification_priority" NOT NULL,
    "metadata" "jsonb",
    "action_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "ketzal"."notifications" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type" DEFAULT 'INFO'::"ketzal"."notification_type", "p_priority" "ketzal"."notification_priority" DEFAULT 'NORMAL'::"ketzal"."notification_priority", "p_metadata" "jsonb" DEFAULT NULL::"jsonb", "p_action_url" "text" DEFAULT NULL::"text") RETURNS "ketzal"."notifications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric DEFAULT 0.20) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$ select ketzal._compute_payment_plan(p_total, current_date, p_final, p_frequency, p_down_pct); $$;


ALTER FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_balance numeric; v_total numeric; v_pagado numeric;
  v_type ketzal.payment_type := coalesce(p_type, 'payment');
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = p_booking_id for update;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund'  then -amount_mxn
                           else 0 end), 0)
    into v_pagado
    from ketzal.payments
   where booking_id = p_booking_id and status = 'COMPLETED';

  if v_type = 'payment' then
    if v_monto > round(v_total - v_pagado, 2) then
      raise exception 'El monto (%) excede el saldo pendiente (%).',
        v_monto, round(v_total - v_pagado, 2);
    end if;
  elsif v_type = 'refund' then
    if v_monto > round(v_pagado, 2) then
      raise exception 'El reembolso (%) excede lo abonado (%).',
        v_monto, round(v_pagado, 2);
    end if;
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment)
  values (p_booking_id, v_supplier, v_uid, v_monto, 'COMPLETED', v_type,
          nullif(trim(coalesce(p_method,'')),''), coalesce(p_paid_at, now()), 1, 1);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status else status end
   where id = p_booking_id and status <> 'cancelled';
  return v_balance;
end $$;


ALTER FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."salud_sistema"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then raise exception 'Solo superadmin'; end if;
  select jsonb_build_object(
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
        'ts', ts, 'source', source, 'level', level, 'event', event, 'detail', detail) order by ts desc)
      from (select * from ketzal.system_log order by ts desc limit 50) t), '[]'::jsonb),
    'invariantes', ketzal.verificar_invariantes()
  ) into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."salud_sistema"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'ketzal', 'public'
    AS $$
begin new.updated_at := now(); return new; end;
$$;


ALTER FUNCTION "ketzal"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin puede cambiar roles'; end if;
  update ketzal.profiles set role = p_role, updated_at = now() where id = p_user;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;


ALTER FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_booking_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."tg_booking_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_ledger_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception
    'ledger append-only: % sobre % está prohibido. Las correcciones son asientos nuevos (payment tipo refund).',
    tg_op, tg_table_name
    using errcode = 'P0001';
end $$;


ALTER FUNCTION "ketzal"."tg_ledger_inmutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "ketzal"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."verificar_invariantes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
  )
  select jsonb_build_object(
    'violaciones', count(*),
    'detalle', coalesce(jsonb_agg(jsonb_build_object('check', chk, 'booking_id', booking_id, 'detalle', detalle)), '[]'::jsonb)
  ) into v
  from viol;

  return v;
end $$;


ALTER FUNCTION "ketzal"."verificar_invariantes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wallet_add_funds"("p_amount_mxn" numeric DEFAULT 0, "p_amount_axo" numeric DEFAULT 0, "p_description" "text" DEFAULT 'Deposito'::"text", "p_reference" "text" DEFAULT NULL::"text", "p_type" "ketzal"."wallet_txn_type" DEFAULT 'DEPOSIT'::"ketzal"."wallet_txn_type") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."wallet_add_funds"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text", "p_type" "ketzal"."wallet_txn_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wallet_convert"("p_from_currency" "text", "p_amount" numeric, "p_rate" numeric, "p_description" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."wallet_convert"("p_from_currency" "text", "p_amount" numeric, "p_rate" numeric, "p_description" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance_mxn" numeric DEFAULT 0 NOT NULL,
    "balance_axo" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."wallets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wallet_ensure"("p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "ketzal"."wallets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."wallet_ensure"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wallet_purchase"("p_amount_mxn" numeric DEFAULT 0, "p_amount_axo" numeric DEFAULT 0, "p_description" "text" DEFAULT 'Compra'::"text", "p_reference" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."wallet_purchase"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wallet_transfer"("p_to_user_id" "uuid", "p_amount_mxn" numeric DEFAULT 0, "p_amount_axo" numeric DEFAULT 0, "p_description" "text" DEFAULT 'Transferencia'::"text", "p_reference" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
$$;


ALTER FUNCTION "ketzal"."wallet_transfer"("p_to_user_id" "uuid", "p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."app_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "platform_commission_rate" numeric(5,2) DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_settings_single_row" CHECK (("id" = 1))
);


ALTER TABLE "ketzal"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."booking_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "item_type" "text" DEFAULT 'passenger'::"text" NOT NULL,
    "passenger_type" "text",
    "description" "text",
    "qty" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."booking_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "folio" "text",
    "selling_supplier_id" "uuid",
    "owner_supplier_id" "uuid",
    "customer_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "sold_by" "uuid",
    "travel_date" "date",
    "num_pax" integer DEFAULT 1 NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "status" "ketzal"."booking_status" DEFAULT 'draft'::"ketzal"."booking_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quote_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "due_date" "date",
    "cancel_reason" "text",
    "statement_token" "uuid",
    "payment_type" "text" DEFAULT 'contado'::"text" NOT NULL,
    "plan_frequency" "text",
    "plan_final_date" "date"
);


ALTER TABLE "ketzal"."bookings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "ketzal"."bookings_with_balance" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "folio",
    NULL::"uuid" AS "selling_supplier_id",
    NULL::"uuid" AS "owner_supplier_id",
    NULL::"uuid" AS "customer_id",
    NULL::"uuid" AS "service_id",
    NULL::"uuid" AS "sold_by",
    NULL::"date" AS "travel_date",
    NULL::integer AS "num_pax",
    NULL::numeric(12,2) AS "subtotal",
    NULL::numeric(12,2) AS "discount",
    NULL::numeric(12,2) AS "total",
    NULL::"text" AS "currency",
    NULL::"ketzal"."booking_status" AS "status",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::numeric AS "paid",
    NULL::numeric AS "balance";


ALTER VIEW "ketzal"."bookings_with_balance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "image" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."clawbot_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "customer_id" "uuid",
    "supplier_id" "uuid",
    "sold_by" "uuid",
    "kind" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "phone" "text",
    "status" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "sent_by" "uuid",
    CONSTRAINT "clawbot_reminders_kind_check" CHECK (("kind" = ANY (ARRAY['abono_por_vencer'::"text", 'abono_vencido'::"text", 'cotizacion_seguimiento'::"text", 'viaje_proximo'::"text"]))),
    CONSTRAINT "clawbot_reminders_status_check" CHECK (("status" = ANY (ARRAY['pendiente'::"text", 'enviado'::"text", 'descartado'::"text"])))
);


ALTER TABLE "ketzal"."clawbot_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "doc_id" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."payment_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "created_by" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "mp_preference_id" "text",
    "mp_payment_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."payment_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."payment_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "seq" integer NOT NULL,
    "kind" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_schedule_kind_check" CHECK (("kind" = ANY (ARRAY['enganche'::"text", 'abono'::"text"])))
);


ALTER TABLE "ketzal"."payment_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planner_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "amount_mxn" numeric NOT NULL,
    "amount_axo" numeric,
    "status" "ketzal"."payment_status" DEFAULT 'PENDING'::"ketzal"."payment_status" NOT NULL,
    "installments" integer DEFAULT 1 NOT NULL,
    "current_installment" integer DEFAULT 1 NOT NULL,
    "due_date" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "payment_method" "text",
    "transaction_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_id" "uuid",
    "supplier_id" "uuid",
    "type" "ketzal"."payment_type" DEFAULT 'payment'::"ketzal"."payment_type" NOT NULL
);


ALTER TABLE "ketzal"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."planner_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planner_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "product_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "price_mxn" numeric NOT NULL,
    "price_axo" numeric,
    "selected_date" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."planner_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric NOT NULL,
    "price_axo" numeric,
    "stock" integer DEFAULT 0 NOT NULL,
    "image" "text",
    "images" "jsonb",
    "category" "text",
    "tags" "jsonb",
    "specifications" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "role" "ketzal"."user_role" DEFAULT 'user'::"ketzal"."user_role" NOT NULL,
    "axo_coins_earned" numeric DEFAULT 50 NOT NULL,
    "referral_code" "text",
    "supplier_id" "uuid",
    "image" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active" boolean DEFAULT false NOT NULL
);


ALTER TABLE "ketzal"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "ketzal"."profiles" IS 'Datos de usuario especificos de Ketzal. Identidad/login vive en auth.users.';



-- Terreno del marketplace (Fase B.0): comprador B2C, aislado de profiles.
CREATE TABLE IF NOT EXISTS "ketzal"."marketplace_customers" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."marketplace_customers" OWNER TO "postgres";


COMMENT ON TABLE "ketzal"."marketplace_customers" IS 'Compradores B2C del marketplace (Fase B). Aislada de profiles (agentes). id = auth.users.id.';


ALTER TABLE ONLY "ketzal"."marketplace_customers"
    ADD CONSTRAINT "marketplace_customers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "ketzal"."marketplace_customers"
    ADD CONSTRAINT "marketplace_customers_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE "ketzal"."marketplace_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mc_select_own" ON "ketzal"."marketplace_customers" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));
CREATE POLICY "mc_insert_own" ON "ketzal"."marketplace_customers" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));
CREATE POLICY "mc_update_own" ON "ketzal"."marketplace_customers" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));


GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."marketplace_customers" TO "authenticated";



CREATE TABLE IF NOT EXISTS "ketzal"."receipt_counters" (
    "supplier_id" "uuid" NOT NULL,
    "last_folio" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "ketzal"."receipt_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "booking_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "folio" bigint NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "issued_by" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pdf_url" "text"
);


ALTER TABLE "ketzal"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "ketzal"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."service_departures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "departs_on" "date" NOT NULL,
    "max_capacity" integer NOT NULL,
    "seats_taken" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_departures_max_capacity_check" CHECK (("max_capacity" > 0)),
    CONSTRAINT "service_departures_no_oversell" CHECK (("seats_taken" <= "max_capacity")),
    CONSTRAINT "service_departures_seats_taken_check" CHECK (("seats_taken" >= 0))
);


ALTER TABLE "ketzal"."service_departures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric NOT NULL,
    "price_axo" numeric,
    "location" "text",
    "available_from" timestamp with time zone,
    "available_to" timestamp with time zone,
    "size_tour" numeric,
    "service_type" "text",
    "service_category" "text",
    "state_from" "text",
    "city_from" "text",
    "state_to" "text",
    "city_to" "text",
    "yt_link" "text",
    "packs" "jsonb",
    "images" "jsonb",
    "includes" "jsonb",
    "excludes" "jsonb",
    "faqs" "jsonb",
    "itinerary" "jsonb",
    "dates" "jsonb",
    "add_ons" "jsonb",
    "seasonal_prices" "jsonb",
    "transport_provider_id" "uuid",
    "hotel_provider_id" "uuid",
    "current_bookings" integer DEFAULT 0 NOT NULL,
    "max_capacity" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published" boolean DEFAULT false NOT NULL
);


ALTER TABLE "ketzal"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_email" "text" NOT NULL,
    "phone_number" "text",
    "address" "text",
    "description" "text",
    "img_logo" "text",
    "supplier_type" "text",
    "supplier_sub_type" "text",
    "location" "jsonb",
    "photos" "jsonb",
    "extras" "jsonb",
    "info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "owner_supplier_id" "uuid"
);


ALTER TABLE "ketzal"."suppliers" OWNER TO "postgres";


COMMENT ON COLUMN "ketzal"."suppliers"."owner_supplier_id" IS 'Agencia dueña de este proveedor operativo. NULL en las agencias (son de primer nivel).';



CREATE TABLE IF NOT EXISTS "ketzal"."system_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "event" "text" NOT NULL,
    "detail" "jsonb",
    CONSTRAINT "system_log_level_check" CHECK (("level" = ANY (ARRAY['info'::"text", 'warn'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "ketzal"."system_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."travel_planners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "destination" "text",
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "status" "ketzal"."planner_status" DEFAULT 'PLANNING'::"ketzal"."planner_status" NOT NULL,
    "total_mxn" numeric DEFAULT 0 NOT NULL,
    "total_axo" numeric DEFAULT 0 NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "share_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."travel_planners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "ketzal"."wallet_txn_type" NOT NULL,
    "amount_mxn" numeric,
    "amount_axo" numeric,
    "description" "text" NOT NULL,
    "reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wishlist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wishlist_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "product_id" "uuid",
    "price_alert" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."wishlist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wishlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Mi Lista de Deseos'::"text" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "share_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."wishlists" OWNER TO "postgres";


ALTER TABLE ONLY "ketzal"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."booking_items"
    ADD CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_statement_token_key" UNIQUE ("statement_token");



ALTER TABLE ONLY "ketzal"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "ketzal"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."clawbot_reminders"
    ADD CONSTRAINT "clawbot_reminders_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "ketzal"."clawbot_reminders"
    ADD CONSTRAINT "clawbot_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."payment_schedule"
    ADD CONSTRAINT "payment_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."products"
    ADD CONSTRAINT "products_name_key" UNIQUE ("name");



ALTER TABLE ONLY "ketzal"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "ketzal"."receipt_counters"
    ADD CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("supplier_id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_supplier_id_folio_key" UNIQUE ("supplier_id", "folio");



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."service_departures"
    ADD CONSTRAINT "service_departures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."service_departures"
    ADD CONSTRAINT "service_departures_service_id_departs_on_key" UNIQUE ("service_id", "departs_on");



ALTER TABLE ONLY "ketzal"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."suppliers"
    ADD CONSTRAINT "suppliers_contact_email_key" UNIQUE ("contact_email");



ALTER TABLE ONLY "ketzal"."suppliers"
    ADD CONSTRAINT "suppliers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "ketzal"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."system_log"
    ADD CONSTRAINT "system_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."travel_planners"
    ADD CONSTRAINT "travel_planners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."travel_planners"
    ADD CONSTRAINT "travel_planners_share_code_key" UNIQUE ("share_code");



ALTER TABLE ONLY "ketzal"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "ketzal"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."wishlists"
    ADD CONSTRAINT "wishlists_share_code_key" UNIQUE ("share_code");



CREATE INDEX "booking_items_booking_idx" ON "ketzal"."booking_items" USING "btree" ("booking_id");



CREATE INDEX "bookings_customer_idx" ON "ketzal"."bookings" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "bookings_quote_token_idx" ON "ketzal"."bookings" USING "btree" ("quote_token");



CREATE INDEX "bookings_selling_idx" ON "ketzal"."bookings" USING "btree" ("selling_supplier_id");



CREATE INDEX "bookings_status_idx" ON "ketzal"."bookings" USING "btree" ("status");



CREATE INDEX "clawbot_owner_idx" ON "ketzal"."clawbot_reminders" USING "btree" ("sold_by", "status");



CREATE INDEX "clawbot_supplier_idx" ON "ketzal"."clawbot_reminders" USING "btree" ("supplier_id", "status");



CREATE INDEX "customers_supplier_idx" ON "ketzal"."customers" USING "btree" ("supplier_id");



CREATE INDEX "idx_notifications_created" ON "ketzal"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_user_read" ON "ketzal"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_payments_user" ON "ketzal"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_planner_items_planner" ON "ketzal"."planner_items" USING "btree" ("planner_id");



CREATE INDEX "idx_planners_user" ON "ketzal"."travel_planners" USING "btree" ("user_id");



CREATE INDEX "idx_reviews_service" ON "ketzal"."reviews" USING "btree" ("service_id");



CREATE INDEX "idx_reviews_user" ON "ketzal"."reviews" USING "btree" ("user_id");



CREATE INDEX "idx_services_hotel" ON "ketzal"."services" USING "btree" ("hotel_provider_id");



CREATE INDEX "idx_services_supplier" ON "ketzal"."services" USING "btree" ("supplier_id");



CREATE INDEX "idx_services_transport" ON "ketzal"."services" USING "btree" ("transport_provider_id");



CREATE INDEX "idx_wallet_txn_wallet" ON "ketzal"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wishlist_items_wishlist" ON "ketzal"."wishlist_items" USING "btree" ("wishlist_id");



CREATE INDEX "idx_wishlists_user" ON "ketzal"."wishlists" USING "btree" ("user_id");



CREATE INDEX "payment_intents_booking_idx" ON "ketzal"."payment_intents" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "payment_intents_mp_payment_uidx" ON "ketzal"."payment_intents" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE INDEX "payment_schedule_booking_idx" ON "ketzal"."payment_schedule" USING "btree" ("booking_id");



CREATE INDEX "payments_booking_idx" ON "ketzal"."payments" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "receipts_payment_id_uidx" ON "ketzal"."receipts" USING "btree" ("payment_id");



CREATE INDEX "service_departures_service_idx" ON "ketzal"."service_departures" USING "btree" ("service_id");



CREATE INDEX "services_published_idx" ON "ketzal"."services" USING "btree" ("published") WHERE "published";



CREATE INDEX "suppliers_owner_idx" ON "ketzal"."suppliers" USING "btree" ("owner_supplier_id");



CREATE INDEX "system_log_ts_idx" ON "ketzal"."system_log" USING "btree" ("ts" DESC);



CREATE OR REPLACE VIEW "ketzal"."bookings_with_balance" WITH ("security_invoker"='true') AS
 SELECT "b"."id",
    "b"."folio",
    "b"."selling_supplier_id",
    "b"."owner_supplier_id",
    "b"."customer_id",
    "b"."service_id",
    "b"."sold_by",
    "b"."travel_date",
    "b"."num_pax",
    "b"."subtotal",
    "b"."discount",
    "b"."total",
    "b"."currency",
    "b"."status",
    "b"."notes",
    "b"."created_at",
    "b"."updated_at",
    (COALESCE("sum"(
        CASE
            WHEN ("p"."type" = 'payment'::"ketzal"."payment_type") THEN "p"."amount_mxn"
            ELSE (0)::numeric
        END), (0)::numeric) - COALESCE("sum"(
        CASE
            WHEN ("p"."type" = 'refund'::"ketzal"."payment_type") THEN "p"."amount_mxn"
            ELSE (0)::numeric
        END), (0)::numeric)) AS "paid",
    ("b"."total" - (COALESCE("sum"(
        CASE
            WHEN ("p"."type" = 'payment'::"ketzal"."payment_type") THEN "p"."amount_mxn"
            ELSE (0)::numeric
        END), (0)::numeric) - COALESCE("sum"(
        CASE
            WHEN ("p"."type" = 'refund'::"ketzal"."payment_type") THEN "p"."amount_mxn"
            ELSE (0)::numeric
        END), (0)::numeric))) AS "balance"
   FROM ("ketzal"."bookings" "b"
     LEFT JOIN "ketzal"."payments" "p" ON ((("p"."booking_id" = "b"."id") AND ("p"."status" = 'COMPLETED'::"ketzal"."payment_status"))))
  GROUP BY "b"."id";



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."payments" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."receipt_counters" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."receipts" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."system_log" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "trg_booking_capacity" AFTER INSERT OR UPDATE ON "ketzal"."bookings" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_booking_capacity"();



CREATE OR REPLACE TRIGGER "trg_bookings_touch" BEFORE UPDATE ON "ketzal"."bookings" FOR EACH ROW EXECUTE FUNCTION "ketzal"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_categories_updated_at" BEFORE UPDATE ON "ketzal"."categories" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_touch" BEFORE UPDATE ON "ketzal"."customers" FOR EACH ROW EXECUTE FUNCTION "ketzal"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "ketzal"."payments" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_planners_updated_at" BEFORE UPDATE ON "ketzal"."travel_planners" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "ketzal"."products" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "ketzal"."profiles" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_departures_touch" BEFORE UPDATE ON "ketzal"."service_departures" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_services_updated_at" BEFORE UPDATE ON "ketzal"."services" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "ketzal"."suppliers" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallets_updated_at" BEFORE UPDATE ON "ketzal"."wallets" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wishlists_updated_at" BEFORE UPDATE ON "ketzal"."wishlists" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



ALTER TABLE ONLY "ketzal"."booking_items"
    ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "ketzal"."customers"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_owner_supplier_id_fkey" FOREIGN KEY ("owner_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_selling_supplier_id_fkey" FOREIGN KEY ("selling_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_sold_by_fkey" FOREIGN KEY ("sold_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."clawbot_reminders"
    ADD CONSTRAINT "clawbot_reminders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."payment_schedule"
    ADD CONSTRAINT "payment_schedule_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_planner_id_fkey" FOREIGN KEY ("planner_id") REFERENCES "ketzal"."travel_planners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_planner_id_fkey" FOREIGN KEY ("planner_id") REFERENCES "ketzal"."travel_planners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ketzal"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."service_departures"
    ADD CONSTRAINT "service_departures_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."services"
    ADD CONSTRAINT "services_hotel_provider_id_fkey" FOREIGN KEY ("hotel_provider_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."services"
    ADD CONSTRAINT "services_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."services"
    ADD CONSTRAINT "services_transport_provider_id_fkey" FOREIGN KEY ("transport_provider_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."suppliers"
    ADD CONSTRAINT "suppliers_owner_supplier_id_fkey" FOREIGN KEY ("owner_supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."travel_planners"
    ADD CONSTRAINT "travel_planners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "ketzal"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ketzal"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "ketzal"."wishlists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "ketzal"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_read" ON "ketzal"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_settings_write" ON "ketzal"."app_settings" FOR UPDATE TO "authenticated" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."booking_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_items_ins" ON "ketzal"."booking_items" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_items"."booking_id") AND ("ketzal"."is_superadmin"() OR ("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"()))))))));



CREATE POLICY "booking_items_sel" ON "ketzal"."booking_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_items"."booking_id") AND ("ketzal"."is_superadmin"() OR ("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))));



ALTER TABLE "ketzal"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_ins" ON "ketzal"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("sold_by" = "auth"."uid"()) AND (("selling_supplier_id" IS NULL) OR ("selling_supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "bookings_sel" ON "ketzal"."bookings" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "bookings_upd" ON "ketzal"."bookings" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK (("ketzal"."is_active"() AND ("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"())))));



ALTER TABLE "ketzal"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_read" ON "ketzal"."categories" FOR SELECT USING (true);



CREATE POLICY "categories_write" ON "ketzal"."categories" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."clawbot_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clawbot_sel" ON "ketzal"."clawbot_reminders" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



ALTER TABLE "ketzal"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_ins" ON "ketzal"."customers" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("created_by" = "auth"."uid"()) AND (("supplier_id" IS NULL) OR ("supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "customers_sel" ON "ketzal"."customers" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "customers_upd" ON "ketzal"."customers" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK (("ketzal"."is_active"() AND ("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))));



ALTER TABLE "ketzal"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "ketzal"."notifications" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "notifications_select" ON "ketzal"."notifications" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "notifications_update" ON "ketzal"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "ketzal"."payment_intents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_intents_ins" ON "ketzal"."payment_intents" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("created_by" = "auth"."uid"())));



CREATE POLICY "payment_intents_sel" ON "ketzal"."payment_intents" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "payment_intents_upd" ON "ketzal"."payment_intents" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK ("ketzal"."is_active"());



ALTER TABLE "ketzal"."payment_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_scoped_ins" ON "ketzal"."payments" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("user_id" = "auth"."uid"()) AND (("supplier_id" IS NULL) OR ("supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "payments_scoped_sel" ON "ketzal"."payments" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("user_id" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "payments_scoped_upd" ON "ketzal"."payments" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("user_id" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK (("ketzal"."is_active"() AND ("ketzal"."is_superadmin"() OR ("user_id" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))));



CREATE POLICY "payments_select" ON "ketzal"."payments" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



ALTER TABLE "ketzal"."planner_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planner_items_select" ON "ketzal"."planner_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "ketzal"."travel_planners" "p"
  WHERE (("p"."id" = "planner_items"."planner_id") AND (("p"."user_id" = "auth"."uid"()) OR ("p"."is_public" = true) OR "ketzal"."is_superadmin"())))));



CREATE POLICY "planner_items_write" ON "ketzal"."planner_items" USING ((EXISTS ( SELECT 1
   FROM "ketzal"."travel_planners" "p"
  WHERE (("p"."id" = "planner_items"."planner_id") AND (("p"."user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "ketzal"."travel_planners" "p"
  WHERE (("p"."id" = "planner_items"."planner_id") AND (("p"."user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())))));



CREATE POLICY "planners_delete" ON "ketzal"."travel_planners" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "planners_insert" ON "ketzal"."travel_planners" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "planners_select" ON "ketzal"."travel_planners" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("is_public" = true) OR "ketzal"."is_superadmin"()));



CREATE POLICY "planners_update" ON "ketzal"."travel_planners" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



ALTER TABLE "ketzal"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_read" ON "ketzal"."products" FOR SELECT USING (true);



CREATE POLICY "products_write" ON "ketzal"."products" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "ketzal"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "ketzal"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "ps_select" ON "ketzal"."payment_schedule" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("booking_id" IN ( SELECT "bookings"."id"
   FROM "ketzal"."bookings"
  WHERE (("bookings"."sold_by" = "auth"."uid"()) OR ("bookings"."selling_supplier_id" = "ketzal"."my_supplier_id"()))))));



ALTER TABLE "ketzal"."receipt_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipts_ins" ON "ketzal"."receipts" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("issued_by" = "auth"."uid"()) AND (("supplier_id" IS NULL) OR ("supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "receipts_sel" ON "ketzal"."receipts" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("issued_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



ALTER TABLE "ketzal"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete" ON "ketzal"."reviews" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "reviews_insert" ON "ketzal"."reviews" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "reviews_read" ON "ketzal"."reviews" FOR SELECT USING (true);



CREATE POLICY "reviews_update" ON "ketzal"."reviews" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



ALTER TABLE "ketzal"."service_departures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_departures_owner" ON "ketzal"."service_departures" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "ketzal"."services" "s"
  WHERE (("s"."id" = "service_departures"."service_id") AND (("s"."supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "ketzal"."services" "s"
  WHERE (("s"."id" = "service_departures"."service_id") AND (("s"."supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())))));



ALTER TABLE "ketzal"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete" ON "ketzal"."services" FOR DELETE USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "services_insert" ON "ketzal"."services" FOR INSERT WITH CHECK (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "services_read" ON "ketzal"."services" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) OR "published"));



CREATE POLICY "services_update" ON "ketzal"."services" FOR UPDATE USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"()))) WITH CHECK (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



ALTER TABLE "ketzal"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete" ON "ketzal"."suppliers" FOR DELETE USING (("ketzal"."is_superadmin"() OR ("owner_supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "suppliers_insert" ON "ketzal"."suppliers" FOR INSERT WITH CHECK (("ketzal"."is_superadmin"() OR ("ketzal"."is_active"() AND ("owner_supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "suppliers_read" ON "ketzal"."suppliers" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("id" = "ketzal"."my_supplier_id"()) OR ("owner_supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "suppliers_update" ON "ketzal"."suppliers" FOR UPDATE USING (("ketzal"."is_superadmin"() OR ("id" = "ketzal"."my_supplier_id"()) OR ("owner_supplier_id" = "ketzal"."my_supplier_id"())));



ALTER TABLE "ketzal"."system_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_log_sel" ON "ketzal"."system_log" FOR SELECT USING ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."travel_planners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_txn_select" ON "ketzal"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "ketzal"."wallets" "w"
  WHERE (("w"."id" = "wallet_transactions"."wallet_id") AND (("w"."user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())))));



ALTER TABLE "ketzal"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets_select" ON "ketzal"."wallets" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



ALTER TABLE "ketzal"."wishlist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wishlist_items_select" ON "ketzal"."wishlist_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "ketzal"."wishlists" "w"
  WHERE (("w"."id" = "wishlist_items"."wishlist_id") AND (("w"."user_id" = "auth"."uid"()) OR ("w"."is_public" = true) OR "ketzal"."is_superadmin"())))));



CREATE POLICY "wishlist_items_write" ON "ketzal"."wishlist_items" USING ((EXISTS ( SELECT 1
   FROM "ketzal"."wishlists" "w"
  WHERE (("w"."id" = "wishlist_items"."wishlist_id") AND (("w"."user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "ketzal"."wishlists" "w"
  WHERE (("w"."id" = "wishlist_items"."wishlist_id") AND (("w"."user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())))));



ALTER TABLE "ketzal"."wishlists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wishlists_delete" ON "ketzal"."wishlists" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "wishlists_insert" ON "ketzal"."wishlists" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "wishlists_select" ON "ketzal"."wishlists" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("is_public" = true) OR "ketzal"."is_superadmin"()));



CREATE POLICY "wishlists_update" ON "ketzal"."wishlists" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



GRANT USAGE ON SCHEMA "ketzal" TO "anon";
GRANT USAGE ON SCHEMA "ketzal" TO "authenticated";
GRANT USAGE ON SCHEMA "ketzal" TO "service_role";



GRANT ALL ON FUNCTION "ketzal"."_compute_payment_plan"("p_total" numeric, "p_start" "date", "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."agency_name"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."agency_name"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_bandeja"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_bandeja"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_generar_recordatorios"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_generar_recordatorios"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_resumen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_resumen"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."cobranza"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."commissions_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."commissions_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."dashboard_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."dashboard_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."ensure_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."ensure_profile"() TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."ensure_statement_token"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date", "p_down_pct" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date", "p_down_pct" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."global_search"("p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_agency_names"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_agency_names"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_customers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_customers"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_public_services"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_public_services"() TO "anon";
GRANT ALL ON FUNCTION "ketzal"."list_public_services"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_team"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_team"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") TO "authenticated";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."notifications" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."notifications" TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."salud_sistema"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."salud_sistema"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."tg_booking_capacity"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."verificar_invariantes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."verificar_invariantes"() TO "service_role";
GRANT ALL ON FUNCTION "ketzal"."verificar_invariantes"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."wallet_add_funds"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text", "p_type" "ketzal"."wallet_txn_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wallet_add_funds"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text", "p_type" "ketzal"."wallet_txn_type") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."wallet_convert"("p_from_currency" "text", "p_amount" numeric, "p_rate" numeric, "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wallet_convert"("p_from_currency" "text", "p_amount" numeric, "p_rate" numeric, "p_description" "text") TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallets" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallets" TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."wallet_ensure"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wallet_ensure"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."wallet_purchase"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wallet_purchase"("p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."wallet_transfer"("p_to_user_id" "uuid", "p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wallet_transfer"("p_to_user_id" "uuid", "p_amount_mxn" numeric, "p_amount_axo" numeric, "p_description" "text", "p_reference" "text") TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."app_settings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."app_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings_with_balance" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings_with_balance" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."categories" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."categories" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."categories" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."clawbot_reminders" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."clawbot_reminders" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."customers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."customers" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_intents" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_intents" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_schedule" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_schedule" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."payments" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."payments" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."planner_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."planner_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."products" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."products" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."products" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."profiles" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipt_counters" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipt_counters" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipts" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipts" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."reviews" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."reviews" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."reviews" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."service_departures" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."service_departures" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."services" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."services" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."services" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."suppliers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."suppliers" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."system_log" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."system_log" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."travel_planners" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."travel_planners" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallet_transactions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallet_transactions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlist_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlist_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlists" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlists" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "ketzal" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "ketzal" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "service_role";




