-- SNAPSHOT del schema `ketzal` — regenerado el 2026-09-03 (main 23ca8cf).
--
-- Al día hasta b091 / m011 inclusive. Verificado por identificador, no por
-- fecha: contiene `claim_quote`, `email_verificado` (b091), `puede_folear`,
-- `puedo_subir_comprobante` (b088) y `puedo_escribir_imagen_supplier` (b090).
-- Schema-only: 0 sentencias `COPY`/`INSERT`, ninguna fila de negocio.
--
-- Cómo regenerarlo (2 min, no hace falta instalar nada):
--
--     supabase db dump --db-url "$DATABASE_URL" --schema ketzal \
--       -f supabase/snapshots/ketzal_schema.sql
--
-- El `DATABASE_URL` está en `.env.local` (session pooler). La CLI de Supabase
-- baja `public.ecr.aws/supabase/postgres` y corre el `pg_dump` de adentro, así
-- que NO se necesita `postgresql-client` en la máquina — que es lo que trabó
-- este archivo desde b071. Requiere Docker corriendo.
--
-- LO QUE ESTE ARCHIVO NO TRAE: las policies de `storage.objects`, que viven en
-- el schema `storage` (de Supabase) y no en `ketzal`. Son seguridad crítica
-- desde el 2026-09-02 y su fuente es
-- `db/proposed/b088_superficie_publica_storage.sql` (bucket privado, escritura
-- scopeada) y `b090_storage_suppliers_y_brand_scopeados.sql`
-- (ADR-0036, ADR-0038). Un rebuild desde este snapshot deja el Storage sin
-- policies: hay que re-aplicar esas dos.
--
-- Fuente de verdad sigue siendo la BD viva (ADR-0014); esto es el espejo.




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


CREATE TYPE "ketzal"."profile_type" AS ENUM (
    'agente',
    'proveedor',
    'embajador',
    'viajero'
);


ALTER TYPE "ketzal"."profile_type" OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."accept_booking_policy"("p_booking" "uuid", "p_canal" "text", "p_meta" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."accept_booking_policy"("p_booking" "uuid", "p_canal" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."accept_pending_invitation"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_inv   record;
begin
  if v_uid is null then return null; end if;
  select lower(u.email),
         coalesce(u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1))
    into v_email, v_name
    from auth.users u where u.id = v_uid;
  if v_email is null then return null; end if;

  if exists (select 1 from ketzal.profiles p where p.id = v_uid and p.supplier_id is not null) then
    return null;
  end if;

  select * into v_inv from ketzal.agency_invitations
   where lower(email) = v_email and status = 'pending'
   order by created_at desc limit 1;
  if v_inv.id is null then return null; end if;

  insert into ketzal.profiles (id, email, name, type, role, supplier_id, active)
  values (v_uid, v_email, v_name, 'agente', v_inv.role, v_inv.supplier_id, true)
  on conflict (id) do update
     set supplier_id = excluded.supplier_id,
         role        = excluded.role,
         type        = 'agente',
         active      = true;

  update ketzal.agency_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv.id;
  return v_inv.supplier_id;
end $$;


ALTER FUNCTION "ketzal"."accept_pending_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."add_my_passenger"("p_booking_id" "uuid", "p_full_name" "text", "p_type" "text" DEFAULT NULL::"text", "p_doc" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_bstatus ketzal.booking_status; v_num_pax int; v_actuales int;
  v_name text; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select status, num_pax into v_bstatus, v_num_pax
  from ketzal.bookings
  where id = p_booking_id and marketplace_customer_id = v_uid;
  if not found then raise exception 'Pedido no encontrado o sin acceso'; end if;
  if v_bstatus not in ('reserved','confirmed','paid') then
    raise exception 'Podrás capturar a tus acompañantes después de tu primer pago.';
  end if;

  v_name := nullif(left(btrim(coalesce(p_full_name,'')), 120), '');
  if v_name is null then raise exception 'Escribe el nombre completo.'; end if;

  select count(*) into v_actuales from ketzal.booking_passengers where booking_id = p_booking_id;
  if v_actuales >= coalesce(v_num_pax, 0) then
    raise exception 'Ya capturaste a los % viajeros de tu compra.', v_num_pax;
  end if;

  insert into ketzal.booking_passengers(booking_id, full_name, passenger_type, doc_id)
  values (p_booking_id, v_name,
          nullif(left(btrim(coalesce(p_type,'')), 40), ''),
          nullif(left(btrim(coalesce(p_doc,'')), 60), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end $$;


ALTER FUNCTION "ketzal"."add_my_passenger"("p_booking_id" "uuid", "p_full_name" "text", "p_type" "text", "p_doc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."agency_name"("p_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select name from ketzal.suppliers where id = p_id and supplier_type = 'agency';
$$;


ALTER FUNCTION "ketzal"."agency_name"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."alertas_anomalias_dinero"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  with anom as (
    select sl.ts, sl.event, sl.detail
    from ketzal.system_log sl
    where sl.source in ('mp_confirm','mp_webhook')
      and sl.event in ('sobrepago','pagado_sin_cupo','pago_cancelado')
      and sl.ts > now() - interval '21 days'
  ),
  scoped as (
    select a.ts, a.event,
           (a.detail->>'booking_id')::uuid as booking_id,
           (a.detail->>'amount')::numeric   as amount,
           a.detail->>'mp_payment_id'        as mp_payment_id,
           b.folio,
           coalesce(cu.full_name, mc.name, 'Cliente') as cliente,
           coalesce(sv.name, 'A medida')                   as servicio
    from anom a
    join ketzal.bookings b on b.id = (a.detail->>'booking_id')::uuid
    left join ketzal.customers cu on cu.id = b.customer_id
    left join ketzal.profiles mc on mc.id = b.marketplace_customer_id
    left join ketzal.services sv on sv.id = b.service_id
    where ketzal.is_superadmin()
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
  )
  select jsonb_build_object(
    'total',     (select count(*) from scoped),
    'sobrepago', (select count(*) from scoped where event = 'sobrepago'),
    'sin_cupo',  (select count(*) from scoped where event = 'pagado_sin_cupo'),
    'cancelado', (select count(*) from scoped where event = 'pago_cancelado'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', event, 'booking_id', booking_id, 'amount', amount,
        'mp_payment_id', mp_payment_id, 'ts', ts, 'folio', folio,
        'cliente', cliente, 'servicio', servicio) order by ts desc)
      from scoped), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "ketzal"."alertas_anomalias_dinero"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ambassador_payables_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then
    return jsonb_build_object('total_debo', 0, 'total_pagado', 0, 'total_saldo', 0, 'lista', '[]'::jsonb);
  end if;

  with dev as (
    select cl.payee_profile_id as emb_id,
           count(*) filter (where cl.kind = 'devengo') as num_ventas,
           coalesce(sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end), 0) as comisiones
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.payee_type = 'embajador'
      and b.status in ('reserved', 'confirmed', 'paid')
    group by cl.payee_profile_id
  ),
  -- Quien solo ha ganado BONOS (reclutó y su recluta vendió, pero él no) también
  -- debe aparecer: si solo se listara a quien tiene comisiones, ese saldo sería
  -- invisible hasta que alguien reclamara.
  con_bono as (
    select distinct r.recruited_by as emb_id
    from ketzal.profiles r where r.recruited_by is not null
  ),
  todos as (
    select emb_id from dev union select emb_id from con_bono
  ),
  pag as (
    select provider_profile_id as emb_id,
           coalesce(sum(case when kind = 'egreso' then amount_mxn else -amount_mxn end), 0) as pagado
    from ketzal.expenses
    where category in ('embajador','agente') and provider_profile_id is not null
    group by provider_profile_id
  ),
  merged as (
    select t.emb_id,
           (select name from ketzal.profiles s where s.id = t.emb_id) as embajador,
           coalesce(d.num_ventas, 0) as num_ventas,
           coalesce(d.comisiones, 0) as comisiones,
           ketzal.bonos_reclutador(t.emb_id) as bonos,
           coalesce(d.comisiones, 0) + ketzal.bonos_reclutador(t.emb_id) as devengado,
           coalesce(p.pagado, 0) as pagado,
           coalesce(d.comisiones, 0) + ketzal.bonos_reclutador(t.emb_id) - coalesce(p.pagado, 0) as saldo
    from todos t
    left join dev d on d.emb_id = t.emb_id
    left join pag p on p.emb_id = t.emb_id
  )
  select jsonb_build_object(
    'total_debo', coalesce(sum(devengado), 0),
    'total_pagado', coalesce(sum(pagado), 0),
    'total_saldo', coalesce(sum(saldo), 0),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'embajador_id', emb_id, 'embajador', embajador, 'num_ventas', num_ventas,
      'comisiones', comisiones, 'bonos', bonos,
      'devengado', devengado, 'pagado', pagado, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
  ) into v
  from merged
  -- Sin nada devengado ni pagado no hay por qué listarlo.
  where devengado <> 0 or pagado <> 0;
  return v;
end $$;


ALTER FUNCTION "ketzal"."ambassador_payables_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."assign_seat"("p_passenger_id" "uuid", "p_seat" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking_id uuid; v_tipo text; v_total int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select bp.booking_id into v_booking_id
  from ketzal.booking_passengers bp where bp.id = p_passenger_id;
  if not found then raise exception 'Pasajero no encontrado'; end if;
  select * into v_b from ketzal.bookings where id = v_booking_id;
  if not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pasajero no encontrado o sin acceso';
  end if;
  if v_b.status not in ('reserved','confirmed','paid') then
    raise exception 'Los asientos se eligen después del primer pago.';
  end if;

  select s.transport_type into v_tipo from ketzal.services s where s.id = v_b.service_id;
  if v_tipo is null then raise exception 'Este viaje no tiene mapa de asientos.'; end if;
  if v_b.travel_date is null then raise exception 'Este viaje no tiene fecha de salida.'; end if;
  select d.max_capacity into v_total
  from ketzal.service_departures d
  where d.service_id = v_b.service_id and d.departs_on = v_b.travel_date;
  if v_total is null then raise exception 'La salida de este viaje no existe.'; end if;
  if p_seat < 1 or p_seat > v_total then
    raise exception 'Asiento fuera de rango (1–%).', v_total;
  end if;

  begin
    insert into ketzal.seat_assignments(booking_id, passenger_id, service_id, travel_date, seat_number)
    values (v_b.id, p_passenger_id, v_b.service_id, v_b.travel_date, p_seat)
    on conflict (passenger_id)
    do update set seat_number = excluded.seat_number, created_at = now();
  exception when unique_violation then
    raise exception 'Ese asiento ya está ocupado. Elige otro.';
  end;

  return jsonb_build_object('ok', true, 'seat', p_seat);
end $$;


ALTER FUNCTION "ketzal"."assign_seat"("p_passenger_id" "uuid", "p_seat" integer) OWNER TO "postgres";


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
  -- b058: entrar a una agencia es volverse su staff. Sólo desde viajero/null:
  -- un 'proveedor' también lleva supplier_id y NO debe volverse agente.
  if p_supplier is not null then
    update ketzal.profiles
       set type = 'agente', updated_at = now()
     where id = p_user and (type is null or type = 'viajero');
  end if;
end $$;


ALTER FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."attribute_booking_by_ref"("p_booking" "uuid", "p_ref" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid; b ketzal.bookings;
begin
  if v_uid is null then return null; end if;
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then return null; end if;

  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    return null;
  end if;

  select id into v_amb from ketzal.profiles
   where referral_code = v_code and type in ('embajador', 'agente');
  if v_amb is null then
    insert into ketzal.referral_misses (booking_id, ref_code, supplier_id, reason)
    values (p_booking, v_code, b.selling_supplier_id, 'codigo_inexistente');
    return null;
  end if;

  if not exists (select 1 from ketzal.profiles p where p.id = v_amb and p.active) then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'perfil_inactivo');
    return null;
  end if;

  if (b.sold_by is not null and b.sold_by = v_amb)
     or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_amb) then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'auto_referido');
    return null;
  end if;

  update ketzal.bookings set ambassador_id = v_amb
   where id = p_booking and ambassador_id is null;

  return v_amb;
end $$;


ALTER FUNCTION "ketzal"."attribute_booking_by_ref"("p_booking" "uuid", "p_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."board_passenger"("p_passenger_id" "uuid", "p_board" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking uuid; v_at timestamptz;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select bp.booking_id into v_booking from ketzal.booking_passengers bp where bp.id = p_passenger_id;
  if not found then raise exception 'Pasajero no encontrado'; end if;
  select * into v_b from ketzal.bookings where id = v_booking;
  if not ketzal.es_staff_de_booking(v_b) then
    raise exception 'Solo el staff de la agencia puede registrar abordajes.';
  end if;

  if p_board then
    update ketzal.booking_passengers
      set boarded_at = coalesce(boarded_at, now()),
          boarded_by = coalesce(boarded_by, v_uid)
      where id = p_passenger_id
      returning boarded_at into v_at;
  else
    update ketzal.booking_passengers
      set boarded_at = null, boarded_by = null
      where id = p_passenger_id;
    v_at := null;
  end if;

  return jsonb_build_object('ok', true, 'boarded_at', v_at);
end $$;


ALTER FUNCTION "ketzal"."board_passenger"("p_passenger_id" "uuid", "p_board" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."boarding_info"("p_voucher_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking uuid; v_folio int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select v.booking_id, v.folio into v_booking, v_folio
  from ketzal.vouchers v where v.id = p_voucher_id;
  if not found then return null; end if;
  select * into v_b from ketzal.bookings where id = v_booking;
  if v_b.status = 'cancelled' then return null; end if;
  if not ketzal.es_staff_de_booking(v_b) then
    raise exception 'Solo el staff de la agencia puede registrar abordajes.';
  end if;

  return jsonb_build_object(
    'booking_id', v_b.id,
    'folio', v_folio,
    'estado', v_b.status,
    'fecha_viaje', v_b.travel_date,
    'num_pax', v_b.num_pax,
    'cliente', (select c.full_name from ketzal.customers c where c.id = v_b.customer_id),
    'servicio', (select s.name from ketzal.services s where s.id = v_b.service_id),
    'pasajeros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id, 'full_name', bp.full_name, 'passenger_type', bp.passenger_type,
        'seat', sa.seat_number, 'boarded_at', bp.boarded_at
      ) order by sa.seat_number nulls last, bp.created_at)
      from ketzal.booking_passengers bp
      left join ketzal.seat_assignments sa on sa.passenger_id = bp.id
      where bp.booking_id = v_b.id
    ), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION "ketzal"."boarding_info"("p_voucher_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."bono_reclutador_monto"() RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$ select 300::numeric $$;


ALTER FUNCTION "ketzal"."bono_reclutador_monto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."bono_reclutador_venta_minima"() RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$ select 1000::numeric $$;


ALTER FUNCTION "ketzal"."bono_reclutador_venta_minima"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."bonos_reclutador"("p_uid" "uuid", "p_hasta" "date" DEFAULT NULL::"date") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(count(*), 0) * ketzal.bono_reclutador_monto()
  from ketzal.profiles recluta
  where recluta.recruited_by = p_uid
    and exists (
      select 1
      from ketzal.commission_lines cl
      join ketzal.bookings b on b.id = cl.booking_id
      where cl.payee_type = 'embajador'
        and cl.payee_profile_id = recluta.id
        and b.status in ('confirmed', 'paid')
        and b.total >= ketzal.bono_reclutador_venta_minima()
        and coalesce(b.marketplace_customer_id, '00000000-0000-0000-0000-000000000000')
            not in (recluta.id, p_uid)
        and (p_hasta is null or cl.created_at::date <= p_hasta)
      group by cl.booking_id
      having sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end) > 0
    );
$$;


ALTER FUNCTION "ketzal"."bonos_reclutador"("p_uid" "uuid", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."can_view_user"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."can_view_user"("p_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."cancel_booking_v2"("p_booking" "uuid", "p_reason" "text", "p_mode" "text", "p_waive_fee" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings;
  v_prev jsonb;
  v_pol jsonb;
  v_pena numeric := 0;
  v_pagado numeric := 0;
  v_credit_id uuid;
  v_monto_credito numeric;
  v_vig int;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if p_mode not in ('efectivo', 'credito') then raise exception 'Modo inválido'; end if;

  select * into v_b from ketzal.bookings where id = p_booking for update;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta ya está cancelada'; end if;
  if p_waive_fee and v_reason is null then
    raise exception 'Condonar la pena requiere motivo (cancelación de la agencia / fuerza mayor).';
  end if;

  v_prev := ketzal.preview_cancellation(p_booking);
  v_pagado := coalesce((v_prev->>'pagado_mxn')::numeric, 0);
  v_pena := case when p_waive_fee or p_mode = 'credito' then 0
                 else coalesce((v_prev->>'pena_mxn')::numeric, 0) end;

  if p_mode = 'credito' and v_pagado > 0 then
    if v_b.selling_supplier_id is null then
      raise exception 'El crédito requiere una venta de agencia (agente libre: usa efectivo).';
    end if;
    if v_b.customer_id is null then
      raise exception 'La venta no tiene cliente para emitir el crédito.';
    end if;
    v_pol := coalesce(v_b.cancellation_policy,
                      ketzal.effective_cancellation_policy(v_b.selling_supplier_id));
    v_vig := least(120, greatest(1, coalesce((v_pol->'credito'->>'vigencia_meses')::int, 12)));
    v_monto_credito := least(v_pagado, round(v_pagado * least(100, greatest(0,
                         coalesce((v_pol->'credito'->>'pct')::numeric, 100))) / 100, 2));

    insert into ketzal.credits(supplier_id, customer_id, booking_origen_id, amount_mxn,
                               expires_at, note, created_by)
    values (v_b.selling_supplier_id, v_b.customer_id, p_booking, v_monto_credito,
            (current_date + make_interval(months => v_vig))::date, v_reason, v_uid)
    returning id into v_credit_id;

    insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                                payment_method, paid_at, installments, current_installment)
    values (p_booking, v_b.selling_supplier_id, v_uid, v_pagado, 'COMPLETED', 'refund',
            'credito', now(), 1, 1);
  end if;

  update ketzal.bookings
     set status = 'cancelled',
         cancel_reason = v_reason,
         cancel_fee_mxn = v_pena,
         cancelled_at = now(),
         updated_at = now()
   where id = p_booking;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, payee_profile_id,
                                      basis, rate, unit_amount, num_pax, amount_mxn, kind, reverses_line_id)
  select cl.booking_id, cl.payee_type, cl.payee_supplier_id, cl.payee_profile_id,
         cl.basis, cl.rate, cl.unit_amount, cl.num_pax, cl.amount_mxn, 'reverso', cl.id
  from ketzal.commission_lines cl
  where cl.booking_id = p_booking and cl.kind = 'devengo'
    and not exists (select 1 from ketzal.commission_lines r where r.reverses_line_id = cl.id);

  return jsonb_build_object(
    'pena_mxn', v_pena,
    'pagado_mxn', v_pagado,
    'a_devolver_mxn', case when p_mode = 'efectivo' then greatest(0, v_pagado - v_pena) else 0 end,
    'credito_id', v_credit_id,
    'credito_mxn', v_monto_credito);
end $$;


ALTER FUNCTION "ketzal"."cancel_booking_v2"("p_booking" "uuid", "p_reason" "text", "p_mode" "text", "p_waive_fee" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."cancel_join_request"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  update ketzal.agency_join_requests
     set status = 'cancelled', resolved_at = now(), resolved_by = v_uid
   where id = p_id and profile_id = v_uid and status = 'pending';
  if not found then raise exception 'Solicitud no encontrada o ya resuelta.'; end if;
end $$;


ALTER FUNCTION "ketzal"."cancel_join_request"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."claim_quote"("p_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b record;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_token is null then raise exception 'Cotización no encontrada'; end if;
  if not exists (select 1 from ketzal.profiles p where p.id = v_uid and p.active) then
    raise exception 'Completa tu cuenta antes de guardar la cotización.';
  end if;

  select id, status, customer_id, marketplace_customer_id
    into v_b from ketzal.bookings where quote_token = p_token for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if v_b.status = 'cancelled' then
    raise exception 'Esta cotización ya no está disponible.';
  end if;
  if v_b.marketplace_customer_id is not null and v_b.marketplace_customer_id <> v_uid then
    raise exception 'Esta cotización ya está guardada en otra cuenta. Si es tuya, pide a tu agencia que la revise.';
  end if;

  if v_b.marketplace_customer_id is null then
    update ketzal.bookings set marketplace_customer_id = v_uid where id = v_b.id;
  end if;
  -- El cliente del agente se liga si está libre y no choca con el índice único.
  update ketzal.customers c set marketplace_customer_id = v_uid
   where c.id = v_b.customer_id and c.marketplace_customer_id is null
     and not exists (select 1 from ketzal.customers c2
                      where c2.supplier_id is not distinct from c.supplier_id
                        and c2.marketplace_customer_id = v_uid);
  return v_b.id;
end $$;


ALTER FUNCTION "ketzal"."claim_quote"("p_token" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_claim_pendientes"("p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "phone" "text", "message" "text", "kind" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  return query
  update ketzal.clawbot_reminders r
     set status = 'enviando'
   where r.id in (
     select r2.id from ketzal.clawbot_reminders r2
      where r2.status = 'pendiente'
        and r2.phone is not null and btrim(r2.phone) <> ''
        -- SOLO kinds dirigidos al comprador (los operativos internos NO se auto-envían).
        -- 'saldo_sin_plan' (F7) agregado 2026-07-23.
        and r2.kind in ('abono_por_vencer','abono_vencido','viaje_proximo','cotizacion_seguimiento','saldo_sin_plan')
      order by r2.created_at
      for update skip locked
      limit greatest(1, p_limit)
   )
  returning r.id, r.phone, r.message, r.kind;
end $$;


ALTER FUNCTION "ketzal"."clawbot_claim_pendientes"("p_limit" integer) OWNER TO "postgres";


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
    and cb.status in ('reserved','confirmed','paid')   -- b070: no a cotizaciones
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
    and cb.status in ('reserved','confirmed','paid')   -- b070: no a cotizaciones
  on conflict (dedupe_key) do nothing;

  -- 3) Cotización sin cerrar (draft >= 3 días) — nudge al cliente
  --    Ésta SÍ es para cotizaciones: su filtro se queda igual.
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
    and cb.status in ('reserved','confirmed','paid')   -- b070: no a cotizaciones
  on conflict (dedupe_key) do nothing;

  select count(*) into v_pend from ketzal.clawbot_reminders where status = 'pendiente';
  return v_pend;
end $_$;


ALTER FUNCTION "ketzal"."clawbot_generar_recordatorios"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_marcar_bot"("p_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  if p_status not in ('enviado','error','pendiente','descartado') then
    raise exception 'status inválido: %', p_status;
  end if;
  update ketzal.clawbot_reminders
     set status  = p_status,
         channel = case when p_status = 'enviado' then 'whatsapp' else channel end,
         sent_at = case when p_status = 'enviado' then now() else sent_at end
   where id = p_id;
end $$;


ALTER FUNCTION "ketzal"."clawbot_marcar_bot"("p_id" "uuid", "p_status" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."clawbot_reglas_operativas"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $_$
declare v_new integer;
begin
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'saldo_sin_plan', 'whatsapp', 'Saldo por cobrar',
    format('Hola %s, tu viaje "%s" con %s tiene un saldo de $%s. ¿Te ayudamos a agendar tu pago? Gracias!',
      coalesce(c.full_name,'cliente'), coalesce(sv.name,'tu viaje'), coalesce(s.name,'Ketzal'),
      to_char(bwb.balance,'FM999,999,990.00')),
    c.phone, 'saldo_sin_plan:'||b.id||':'||to_char(current_date,'IYYY-IW')
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.customers c  on c.id  = b.customer_id
  left join ketzal.services  sv on sv.id = b.service_id
  left join ketzal.suppliers  s on s.id  = b.selling_supplier_id
  where b.status in ('reserved','confirmed')
    and b.payment_type = 'contado'
    and bwb.balance > 0
    and b.created_at::date <= current_date - 3
  on conflict (dedupe_key) do nothing;

  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'viaje_manana_operativo', 'interno', 'Viaje mañana',
    format('Mañana %s sale "%s" (%s pax). Pasajeros capturados: %s/%s — revisa el manifiesto.',
      to_char(b.travel_date,'DD/MM'), coalesce(sv.name,'el viaje'), b.num_pax,
      (select count(*) from ketzal.booking_passengers bp where bp.booking_id = b.id), b.num_pax),
    null, 'viaje_manana_operativo:'||b.id||':'||b.travel_date
  from ketzal.bookings b
  left join ketzal.services sv on sv.id = b.service_id
  where b.status in ('reserved','confirmed','paid')
    and b.travel_date = current_date + 1
  on conflict (dedupe_key) do nothing;

  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'pago_sin_recibo', 'interno', 'Abono sin recibo',
    format('El abono de $%s de la venta %s (%s) no tiene recibo emitido — emítelo para el cliente.',
      to_char(p.amount_mxn,'FM999,999,990.00'),
      coalesce(b.folio,'#'||left(b.id::text,8)), coalesce(c.full_name,'cliente')),
    null, 'pago_sin_recibo:'||p.id
  from ketzal.payments p
  join ketzal.bookings b on b.id = p.booking_id
  left join ketzal.customers c on c.id = b.customer_id
  where p.type = 'payment' and p.status = 'COMPLETED'
    and coalesce(p.paid_at, p.created_at) <= now() - interval '24 hours'
    and b.status <> 'cancelled'
    and not exists (select 1 from ketzal.receipts r where r.payment_id = p.id)
  on conflict (dedupe_key) do nothing;

  select count(*) into v_new from ketzal.clawbot_reminders where status = 'pendiente';
  return v_new;
end $_$;


ALTER FUNCTION "ketzal"."clawbot_reglas_operativas"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."clear_password_change_flag"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  update ketzal.profiles set must_change_password = false where id = auth.uid();
$$;


ALTER FUNCTION "ketzal"."clear_password_change_flag"() OWNER TO "postgres";


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
    where b.status in ('reserved', 'confirmed', 'paid') and bwb.balance > 0
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


CREATE OR REPLACE FUNCTION "ketzal"."commission_amount"("p_basis" "text", "p_rate" numeric, "p_unit" numeric, "p_num_pax" integer, "p_total" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case p_basis
    when 'percent'    then round(coalesce(p_total,0) * coalesce(p_rate,0) / 100.0, 2)
    when 'fijo_pax'   then round(coalesce(p_unit,0) * coalesce(p_num_pax,0), 2)
    when 'fijo_venta' then round(coalesce(p_unit,0), 2)
    when 'hibrido'    then round(coalesce(p_total,0) * coalesce(p_rate,0) / 100.0, 2)
                          + round(coalesce(p_unit,0) * coalesce(p_num_pax,0), 2)
    else 0 end;
$$;


ALTER FUNCTION "ketzal"."commission_amount"("p_basis" "text", "p_rate" numeric, "p_unit" numeric, "p_num_pax" integer, "p_total" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."commissions_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
begin
  with mine as (
    select
      cl.booking_id, cl.payee_type, cl.basis, cl.rate, cl.unit_amount, cl.amount_mxn,
      b.total, b.status, b.marketplace_customer_id, b.owner_supplier_id, b.created_at,
      (select full_name from ketzal.customers c where c.id = b.customer_id) as cliente,
      (select name from ketzal.services s where s.id = b.service_id) as servicio
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.kind = 'devengo'
      and b.status in ('reserved', 'confirmed', 'paid')
      and (
        (v_super and cl.payee_type = 'plataforma')
        or (v_sup is not null and cl.payee_type = 'agencia' and cl.payee_supplier_id = v_sup)
      )
  )
  select jsonb_build_object(
    'total_comision', coalesce(sum(amount_mxn), 0),
    'num', count(*),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'id', booking_id,
      'cliente', cliente,
      'servicio', servicio,
      'owner', case
        when payee_type = 'plataforma'
          then coalesce((select name from ketzal.suppliers o where o.id = owner_supplier_id), 'Ketzal (plataforma)')
        else coalesce((select name from ketzal.suppliers o where o.id = owner_supplier_id), '—')
      end,
      'total', total,
      'basis', basis,
      'rate', rate,
      'unit_amount', unit_amount,
      'comision', amount_mxn,
      'status', status,
      'tipo', case
        when payee_type = 'plataforma' and marketplace_customer_id is not null then 'marketplace'
        when payee_type = 'plataforma' then 'libre'
        else 'reventa'
      end
    ) order by created_at desc), '[]'::jsonb)
  ) into v from mine;
  return v;
end $$;


ALTER FUNCTION "ketzal"."commissions_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text", "p_method" "text" DEFAULT 'mercadopago'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_intent ketzal.payment_intents;
  v_pay uuid; v_balance numeric; v_apply numeric(12,2);
  v_bstatus ketzal.booking_status;
  v_seated boolean := true;
  v_user uuid;
begin
  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'intent_not_found'); end if;
  if v_intent.status = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;

  if p_status <> 'approved' then
    update ketzal.payment_intents set status = p_status, mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    return jsonb_build_object('ok', true, 'status', p_status);
  end if;

  perform 1 from ketzal.bookings where id = v_intent.booking_id for update;

  v_user := coalesce(v_intent.created_by, v_intent.marketplace_customer_id);
  select status into v_bstatus from ketzal.bookings where id = v_intent.booking_id;

  if v_bstatus = 'cancelled' then
    update ketzal.payment_intents set status = 'approved', mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'pago_cancelado',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount));
    return jsonb_build_object('ok', true, 'cancelled', true, 'applied', 0);
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = v_intent.booking_id;
  if v_balance <= 0 then
    update ketzal.payment_intents set status = 'approved', mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'sobrepago',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount, 'aplicado', 0));
    return jsonb_build_object('ok', true, 'overpaid', true, 'applied', 0, 'balance', v_balance);
  end if;

  v_apply := least(v_intent.amount, round(v_balance, 2));

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, transaction_id, paid_at, installments, current_installment)
  values (v_intent.booking_id, v_intent.supplier_id, v_user, v_apply, 'COMPLETED', 'payment',
          p_method, p_mp_payment_id, now(), 1, 1)
  returning id into v_pay;

  update ketzal.payment_intents
    set status = 'approved', mp_payment_id = p_mp_payment_id, payment_id = v_pay, updated_at = now()
    where id = p_intent_id;

  -- b053: asientos del ledger para cobros MP (best-effort: no tumba el cobro).
  if p_method = 'mercadopago' and v_intent.supplier_id is not null then
    begin
      if v_intent.split then
        if coalesce(v_intent.mp_fee, 0) > 0 then
          perform ketzal.ledger_post(jsonb_build_array(
            jsonb_build_object('account_type','agencia','account_supplier_id', v_intent.supplier_id,
              'kind','fee_cobrado_split','amount_mxn', v_intent.mp_fee,
              'booking_id', v_intent.booking_id, 'payment_id', v_pay,
              'note','Fee cobrado en el split de MP'),
            jsonb_build_object('account_type','plataforma',
              'kind','fee_cobrado_split','amount_mxn', -v_intent.mp_fee,
              'booking_id', v_intent.booking_id, 'payment_id', v_pay,
              'note','Fee cobrado en el split de MP')
          ));
        end if;
      else
        perform ketzal.ledger_post(jsonb_build_array(
          jsonb_build_object('account_type','plataforma',
            'kind','cobro_por_cuenta','amount_mxn', -v_apply,
            'booking_id', v_intent.booking_id, 'payment_id', v_pay,
            'available_at', (now() + interval '7 days')::text,
            'note','Cobro MP por cuenta de la agencia (payout a 7 días)'),
          jsonb_build_object('account_type','agencia','account_supplier_id', v_intent.supplier_id,
            'kind','cobro_por_cuenta','amount_mxn', v_apply,
            'booking_id', v_intent.booking_id, 'payment_id', v_pay,
            'available_at', (now() + interval '7 days')::text,
            'note','Venta cobrada por Ketzal (payout a 7 días)')
        ));
      end if;
    exception when others then
      insert into ketzal.system_log(source, level, event, detail)
      values ('mp_confirm', 'warn', 'ledger_fallo',
        jsonb_build_object('intent', p_intent_id, 'payment_id', v_pay, 'motivo', SQLERRM));
    end;
  end if;

  if v_intent.amount > v_apply then
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'sobrepago',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount, 'aplicado', v_apply));
  end if;

  if v_bstatus = 'draft' then
    begin
      update ketzal.bookings set status = 'reserved'
        where id = v_intent.booking_id and status = 'draft';
    exception when others then
      v_seated := false;
      insert into ketzal.system_log(source, level, event, detail)
      values ('mp_confirm', 'warn', 'pagado_sin_cupo',
        jsonb_build_object('booking_id', v_intent.booking_id, 'payment_id', v_pay,
          'mp_payment_id', p_mp_payment_id, 'motivo', SQLERRM));
    end;
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = v_intent.booking_id;

  if v_seated then
    update ketzal.bookings set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status else status end
      where id = v_intent.booking_id and status not in ('cancelled','paid');
  end if;

  return jsonb_build_object('ok', true, 'payment_id', v_pay, 'balance', v_balance, 'seated', v_seated, 'applied', v_apply);
end $$;


ALTER FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text", "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."conversion_summary"("p_from" "date", "p_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then
    return jsonb_build_object('cotizadas',0,'convertidas',0,'tasa',0,'por_agente','[]'::jsonb);
  end if;

  with q as (
    select b.sold_by,
           (b.status in ('reserved','confirmed','paid')) as es_venta
    from ketzal.bookings b
    where b.quote_folio is not null
      and b.created_at::date between p_from and p_to
      and (v_super or b.selling_supplier_id = v_sup)
  )
  select jsonb_build_object(
    'cotizadas',   count(*),
    'convertidas', count(*) filter (where es_venta),
    'tasa', case when count(*) > 0
                 then round(100.0 * count(*) filter (where es_venta) / count(*), 1) else 0 end,
    'por_agente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agente', coalesce(p.name, p.email, 'Agente'),
        'cotizadas', c.cot, 'convertidas', c.conv,
        'tasa', case when c.cot > 0 then round(100.0 * c.conv / c.cot, 1) else 0 end
      ) order by c.cot desc)
      from (select sold_by, count(*) cot, count(*) filter (where es_venta) conv
            from q group by sold_by) c
      left join ketzal.profiles p on p.id = c.sold_by
    ), '[]'::jsonb)
  ) into v from q;
  return v;
end $$;


ALTER FUNCTION "ketzal"."conversion_summary"("p_from" "date", "p_to" "date") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."corte_embajadores"("p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb;
begin
  if not (ketzal.is_superadmin() or coalesce(ketzal.is_agency_admin(ketzal.my_supplier_id()), false)) then
    raise exception 'Solo un administrador puede ver el corte.';
  end if;

  with visible as (
    select case when ketzal.is_superadmin() then null else ketzal.my_supplier_id() end as sup
  ),
  devengos as (
    select cl.payee_profile_id as emb_id,
           b.selling_supplier_id as agencia_id,
           sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end) as devengado,
           count(*) filter (where cl.kind = 'devengo')::bigint as num_ventas
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    join ketzal.bookings_with_balance bb on bb.id = b.id
    cross join visible
    where cl.payee_type = 'embajador'
      and b.status in ('reserved','confirmed','paid')
      and cl.created_at::date <= p_hasta
      and bb.paid > 0
      and (visible.sup is null or b.selling_supplier_id = visible.sup)
    group by cl.payee_profile_id, b.selling_supplier_id
  ),
  pagos as (
    select e.provider_profile_id as emb_id, e.supplier_id as agencia_id,
           sum(case when e.kind = 'egreso' then e.amount_mxn else -e.amount_mxn end) as pagado
    from ketzal.expenses e
    cross join visible
    where e.category in ('embajador','agente')
      and e.provider_profile_id is not null
      and e.supplier_id is not null
      and e.spent_at <= p_hasta
      and (visible.sup is null or e.supplier_id = visible.sup)
    group by e.provider_profile_id, e.supplier_id
  ),
  filas as (
    select coalesce(d.emb_id, p.emb_id) as emb_id,
           coalesce(d.agencia_id, p.agencia_id) as agencia_id,
           'comision'::text as concepto,
           coalesce(d.devengado, 0)::numeric as devengado,
           coalesce(d.num_ventas, 0)::bigint as num_ventas,
           coalesce(p.pagado, 0)::numeric as pagado
    from devengos d
    full outer join pagos p
      on p.emb_id = d.emb_id and p.agencia_id is not distinct from d.agencia_id
    where coalesce(d.agencia_id, p.agencia_id) is not null
  ),
  bonos as (
    select pr.id as emb_id, null::uuid as agencia_id, 'bono'::text as concepto,
           ketzal.bonos_reclutador(pr.id, p_hasta)::numeric as devengado,
           0::bigint as num_ventas,
           coalesce((
             select sum(case when e.kind='egreso' then e.amount_mxn else -e.amount_mxn end)
             from ketzal.expenses e
             where e.category in ('embajador','agente')
               and e.provider_profile_id = pr.id
               and e.supplier_id is null
               and e.spent_at <= p_hasta), 0)::numeric as pagado
    from ketzal.profiles pr
    cross join visible
    where visible.sup is null
      and exists (select 1 from ketzal.profiles r where r.recruited_by = pr.id)
  ),
  todo as (
    select * from filas
    union all
    select * from bonos where devengado <> 0 or pagado <> 0
  )
  select jsonb_build_object(
    'hasta', p_hasta,
    'total_a_pagar', coalesce(sum(devengado - pagado) filter (where devengado - pagado <> 0), 0),
    'filas', coalesce(jsonb_agg(jsonb_build_object(
      'embajador_id', emb_id,
      'embajador', (select name from ketzal.profiles s where s.id = emb_id),
      'agencia_id', agencia_id,
      'agencia', (select name from ketzal.suppliers s where s.id = agencia_id),
      'concepto', concepto,
      'num_ventas', num_ventas,
      'devengado', devengado,
      'pagado', pagado,
      'a_pagar', devengado - pagado)
      order by (devengado - pagado) desc) filter (where devengado - pagado <> 0), '[]'::jsonb)
  ) into v
  from todo;
  return v;
end $$;


ALTER FUNCTION "ketzal"."corte_embajadores"("p_hasta" "date") OWNER TO "postgres";


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
  v_quote_folio bigint := null;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  if v_status not in ('reserved','draft') then raise exception 'Estado inicial inválido'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Necesita al menos una línea'; end if;

  if v_customer is not null then
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
end $$;


ALTER FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."create_expense"("p_concept" "text", "p_category" "text", "p_amount" numeric, "p_method" "text", "p_spent_at" "date", "p_provider_supplier_id" "uuid" DEFAULT NULL::"uuid", "p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_sup uuid := ketzal.my_supplier_id();
        v_amount numeric(12,2) := round(p_amount, 2); v_id uuid;
        v_prov_sup uuid; v_prov_prof uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  if coalesce(trim(p_concept),'') = '' then raise exception 'Falta el concepto del gasto'; end if;
  if p_category not in ('operacion','transporte','hospedaje','alimentos','mayorista','embajador','marketing','otro')
    then raise exception 'Categoría inválida'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_category = 'mayorista' then
    if p_provider_supplier_id is null then raise exception 'Un pago a mayorista requiere el proveedor'; end if;
    v_prov_sup := p_provider_supplier_id;
  elsif p_category = 'embajador' then
    if p_provider_supplier_id is null then raise exception 'Un pago a embajador requiere el embajador'; end if;
    if not ketzal.is_ambassador(p_provider_supplier_id) then raise exception 'Embajador no válido'; end if;
    v_prov_prof := p_provider_supplier_id;
  end if;
  insert into ketzal.expenses(supplier_id, created_by, kind, concept, category, amount_mxn,
    method, spent_at, provider_supplier_id, provider_profile_id, booking_id, notes)
  values (v_sup, v_uid, 'egreso', trim(p_concept), p_category, v_amount,
    nullif(trim(coalesce(p_method,'')),''), coalesce(p_spent_at, current_date),
    v_prov_sup, v_prov_prof, p_booking_id, nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "ketzal"."create_expense"("p_concept" "text", "p_category" "text", "p_amount" numeric, "p_method" "text", "p_spent_at" "date", "p_provider_supplier_id" "uuid", "p_booking_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."create_marketplace_order"("p_service_id" "uuid", "p_travel_date" "date", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_buyer ketzal.profiles%rowtype;
  v_svc ketzal.services%rowtype;
  v_owner uuid;
  v_customer uuid;
  v_subtotal numeric(12,2) := 0;
  v_num_pax int := 0;
  v_booking uuid;
  it jsonb; v_qty int; v_unit numeric(12,2);
  v_has_dep boolean;
  v_pct numeric := 0;
  v_overrides jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_buyer from ketzal.profiles where id = v_uid;
  if not found then raise exception 'Necesitas una cuenta de Ketzal para pedir.'; end if;

  select * into v_svc from ketzal.services where id = p_service_id and published;
  if not found then raise exception 'Servicio no disponible.'; end if;
  v_owner := v_svc.supplier_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecciona al menos una opción.';
  end if;

  v_has_dep := exists (select 1 from ketzal.service_departures d where d.service_id = p_service_id);
  if v_has_dep then
    if p_travel_date is null then raise exception 'Selecciona la fecha de salida.'; end if;
    select d.price_pct, d.pack_price_overrides into v_pct, v_overrides
    from ketzal.service_departures d
    where d.service_id = p_service_id and d.departs_on = p_travel_date;
    if not found then
      raise exception 'Sin cupo para la salida seleccionada.';
    end if;
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Cantidad inválida.'; end if;
    select round(coalesce(
             (v_overrides->>(it->>'pack_key'))::numeric,
             (p->>'price')::numeric * (1 + v_pct / 100)
           ), 2) into v_unit
      from jsonb_array_elements(coalesce(v_svc.packs, '[]'::jsonb)) p
      where p->>'key' = it->>'pack_key'
      limit 1;
    if v_unit is null then raise exception 'Opción inválida: %', coalesce(it->>'pack_key','(vacío)'); end if;
    v_subtotal := v_subtotal + round(v_qty * v_unit, 2);
    v_num_pax := v_num_pax + v_qty;
  end loop;
  v_subtotal := round(v_subtotal, 2);

  if v_has_dep then
    if not exists (
      select 1 from ketzal.service_departures d
      where d.service_id = p_service_id
        and d.departs_on = p_travel_date
        and d.seats_taken + v_num_pax <= d.max_capacity
    ) then
      raise exception 'Sin cupo para la salida seleccionada.';
    end if;
  end if;

  select id into v_customer from ketzal.customers
    where supplier_id = v_owner and marketplace_customer_id = v_uid
    limit 1;
  if v_customer is null then
    insert into ketzal.customers(supplier_id, full_name, phone, email, created_by, marketplace_customer_id)
    values (v_owner, v_buyer.name, v_buyer.phone, v_buyer.email, null, v_uid)
    returning id into v_customer;
  end if;

  insert into ketzal.bookings(
    selling_supplier_id, owner_supplier_id, customer_id, marketplace_customer_id,
    service_id, sold_by, travel_date, num_pax, subtotal, discount, total, currency, status, channel)
  values (
    v_owner, v_owner, v_customer, v_uid,
    p_service_id, null, case when v_has_dep then p_travel_date else null end,
    v_num_pax, v_subtotal, 0, v_subtotal, 'MXN', 'draft', 'portal')
  returning id into v_booking;

  insert into ketzal.booking_items(booking_id, item_type, passenger_type, description, qty, unit_price, line_total)
  select v_booking, 'passenger', li->>'pack_key', li->>'label', (li->>'qty')::int,
         pk.price, round((li->>'qty')::int * pk.price, 2)
  from jsonb_array_elements(p_items) li
  join lateral (
    select round(coalesce(
             (v_overrides->>(li->>'pack_key'))::numeric,
             (p->>'price')::numeric * (1 + v_pct / 100)
           ), 2) as price
    from jsonb_array_elements(v_svc.packs) p
    where p->>'key' = li->>'pack_key'
    limit 1
  ) pk on true;

  return v_booking;
end $$;


ALTER FUNCTION "ketzal"."create_marketplace_order"("p_service_id" "uuid", "p_travel_date" "date", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."create_marketplace_payment_intent"("p_booking_id" "uuid", "p_amount" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_mc uuid; v_balance numeric; v_amount numeric(12,2); v_id uuid;
  v_channel text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select selling_supplier_id, marketplace_customer_id, channel
    into v_supplier, v_mc, v_channel
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_mc is null or v_mc <> v_uid then raise exception 'Pedido no encontrado o sin acceso'; end if;
  -- b091: la cobranza de una venta del back-office la lleva el agente.
  if v_channel <> 'portal' then
    raise exception 'Este viaje lo lleva tu agencia: los pagos van con ella.';
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  v_amount := round(coalesce(p_amount, v_balance), 2);
  if v_amount <= 0 then raise exception 'Este pedido no tiene saldo por pagar.'; end if;
  if v_amount > round(coalesce(v_balance, 0), 2) then
    raise exception 'El monto (%) excede el saldo pendiente (%).', v_amount, round(coalesce(v_balance,0),2);
  end if;

  insert into ketzal.payment_intents(booking_id, supplier_id, created_by, marketplace_customer_id, amount)
  values (p_booking_id, v_supplier, null, v_uid, v_amount)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $$;


ALTER FUNCTION "ketzal"."create_marketplace_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."delete_my_draft_order"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_mc uuid;
  v_status ketzal.booking_status;
  v_channel text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select marketplace_customer_id, status, channel into v_mc, v_status, v_channel
    from ketzal.bookings where id = p_booking_id for update;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  -- b091: una cotización del back-office la borra su agente, no el viajero.
  if v_channel <> 'portal' then
    raise exception 'Esta cotización la lleva tu agencia: cualquier cambio va con ella.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo puedes eliminar pedidos que sigan pendientes de pago.';
  end if;

  if exists (select 1 from ketzal.payments where booking_id = p_booking_id) then
    raise exception 'Este pedido ya tiene un pago registrado, no se puede eliminar.';
  end if;

  if exists (select 1 from ketzal.payment_intents where booking_id = p_booking_id) then
    raise exception 'Este pedido tiene un intento de pago en curso, no se puede eliminar.';
  end if;

  delete from ketzal.bookings where id = p_booking_id;
end
$$;


ALTER FUNCTION "ketzal"."delete_my_draft_order"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."delete_sales_goal"("p_agent" "uuid", "p_month" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_super boolean := ketzal.is_superadmin();
  v_role text := (select role from ketzal.profiles where id = auth.uid());
  v_sup uuid := ketzal.my_supplier_id();
  m date := date_trunc('month', p_month)::date;
begin
  if not v_super and v_role <> 'admin' then
    raise exception 'Solo un admin puede borrar metas.';
  end if;
  delete from ketzal.sales_goals
   where month = m
     and agent_id is not distinct from p_agent
     and (v_super or supplier_id = v_sup);
end $$;


ALTER FUNCTION "ketzal"."delete_sales_goal"("p_agent" "uuid", "p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."departure_lists"("p_departure_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_dep ketzal.service_departures;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_dep from ketzal.service_departures where id = p_departure_id;
  if not found then raise exception 'Salida no encontrada'; end if;
  select supplier_id into v_owner from ketzal.services where id = v_dep.service_id;
  if not ketzal.is_superadmin()
     and not (ketzal.is_active() and v_owner = ketzal.my_supplier_id()) then
    raise exception 'Solo la agencia dueña del servicio puede ver estas listas.';
  end if;

  return jsonb_build_object(
    -- BUSLIST: pase de abordar por asiento (nulls al final), con abordaje.
    'buslist', coalesce((
      select jsonb_agg(jsonb_build_object(
               'passenger_id', x.pid, 'full_name', x.full_name,
               'passenger_type', x.passenger_type, 'doc_id', x.doc_id,
               'seat', x.seat, 'boarded_at', x.boarded_at,
               'cliente', x.cliente, 'folio', x.folio, 'status', x.status,
               'agencia', x.agencia)
             order by x.seat nulls last, x.created_at)
      from (
        select bp.id as pid, bp.full_name, bp.passenger_type, bp.doc_id,
               sa.seat_number as seat, bp.boarded_at, bp.created_at,
               c.full_name as cliente, b.quote_folio as folio, b.status::text as status,
               sp.name as agencia
        from ketzal.bookings b
        join ketzal.booking_passengers bp on bp.booking_id = b.id
        left join ketzal.seat_assignments sa on sa.passenger_id = bp.id
        left join ketzal.customers c on c.id = b.customer_id
        left join ketzal.suppliers sp on sp.id = b.selling_supplier_id
        where b.service_id = v_dep.service_id
          and b.travel_date = v_dep.departs_on
          and b.status in ('reserved','confirmed','paid')
      ) x
    ), '[]'::jsonb),
    -- ROOMLIST: por venta — cliente, agencia, ocupación (líneas de pasajero
    -- de la venta: doble/triple/etc. con cantidad) y nombres.
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'booking_id', y.id, 'cliente', y.cliente, 'folio', y.folio,
               'status', y.status, 'agencia', y.agencia, 'num_pax', y.num_pax,
               'habitaciones', y.habitaciones, 'pasajeros', y.pasajeros)
             order by y.cliente nulls last)
      from (
        select b.id, c.full_name as cliente, b.quote_folio as folio,
               b.status::text as status, sp.name as agencia, b.num_pax,
               coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'label', coalesce(bi.description, bi.passenger_type, 'Lugar'),
                          'qty', bi.qty) order by bi.created_at)
                 from ketzal.booking_items bi
                 where bi.booking_id = b.id and bi.item_type = 'passenger'
               ), '[]'::jsonb) as habitaciones,
               coalesce((
                 select jsonb_agg(bp.full_name order by bp.created_at)
                 from ketzal.booking_passengers bp where bp.booking_id = b.id
               ), '[]'::jsonb) as pasajeros
        from ketzal.bookings b
        left join ketzal.customers c on c.id = b.customer_id
        left join ketzal.suppliers sp on sp.id = b.selling_supplier_id
        where b.service_id = v_dep.service_id
          and b.travel_date = v_dep.departs_on
          and b.status in ('reserved','confirmed','paid')
      ) y
    ), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION "ketzal"."departure_lists"("p_departure_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."effective_cancellation_policy"("p_supplier" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  with raw as (
    select coalesce(
      (select s.info->'cancellation_policy' from ketzal.suppliers s where s.id = p_supplier),
      (select a.cancellation_policy from ketzal.app_settings a where a.id = 1)
    ) as pol
  )
  select case when raw.pol is null then null else
    raw.pol || jsonb_build_object(
      'tramos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'dias_min', greatest(0, (t->>'dias_min')::int),
                 'retencion_pct', least(100, greatest(0, (t->>'retencion_pct')::numeric)))
               order by greatest(0, (t->>'dias_min')::int) desc)
        from jsonb_array_elements(
               case when jsonb_typeof(raw.pol->'tramos') = 'array'
                    then raw.pol->'tramos' else '[]'::jsonb end) t
        where t ? 'dias_min' and t ? 'retencion_pct'
      ), '[]'::jsonb),
      'no_show_pct', least(100, greatest(0, coalesce((raw.pol->>'no_show_pct')::numeric, 100))),
      'credito', jsonb_build_object(
        'pct', least(100, greatest(0, coalesce((raw.pol->'credito'->>'pct')::numeric, 100))),
        'vigencia_meses', least(120, greatest(1, coalesce((raw.pol->'credito'->>'vigencia_meses')::int, 12))))
    )
  end
  from raw;
$$;


ALTER FUNCTION "ketzal"."effective_cancellation_policy"("p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."email_verificado"("p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce((
    select u.email_confirmed_at is not null
       and (u.confirmation_sent_at is not null
            or exists (select 1 from auth.identities i
                        where i.user_id = u.id and i.provider = 'google'
                          and coalesce(i.identity_data->>'email_verified','') = 'true'))
      from auth.users u where u.id = p_uid
  ), false);
$$;


ALTER FUNCTION "ketzal"."email_verificado"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."emit_my_voucher"("p_booking_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_id uuid; v_supplier uuid; v_status ketzal.booking_status; v_folio bigint;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select selling_supplier_id, status into v_supplier, v_status
    from ketzal.bookings where id = p_booking_id and marketplace_customer_id = v_uid;
  if not found then raise exception 'Viaje no encontrado'; end if;
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  if found then return v_id; end if;
  if v_status not in ('reserved','confirmed','paid') then
    raise exception 'El voucher está disponible cuando tu compra está apartada o pagada.';
  end if;
  v_folio := ketzal.next_doc_folio(coalesce(v_supplier, v_uid), 'voucher');
  insert into ketzal.vouchers(booking_id, supplier_id, folio, created_by)
    values (p_booking_id, v_supplier, v_folio, v_uid)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id; return v_id;
end $$;


ALTER FUNCTION "ketzal"."emit_my_voucher"("p_booking_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."emit_voucher"("p_booking_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_id uuid;
  v_supplier uuid;
  v_status ketzal.booking_status;
  v_folio bigint;
begin
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  if found then return v_id; end if;

  select selling_supplier_id, status into v_supplier, v_status
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
  if v_status not in ('reserved','confirmed','paid') then
    raise exception 'El voucher se emite en ventas confirmadas (no borrador ni cancelada).';
  end if;

  v_folio := ketzal.next_doc_folio(coalesce(v_supplier, auth.uid()), 'voucher');

  insert into ketzal.vouchers(booking_id, supplier_id, folio)
    values (p_booking_id, v_supplier, v_folio)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  return v_id;
end $$;


ALTER FUNCTION "ketzal"."emit_voucher"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ensure_profile"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  insert into ketzal.profiles (id, email, name, type, active)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                  split_part(u.email, '@', 1)),
         'viajero', true
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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    "plan_final_date" "date",
    "marketplace_customer_id" "uuid",
    "quote_folio" bigint,
    "exchange_rate" numeric(12,4),
    "ambassador_id" "uuid",
    "cancellation_policy" "jsonb",
    "policy_accepted_at" timestamp with time zone,
    "policy_accepted_meta" "jsonb",
    "cancel_fee_mxn" numeric(12,2),
    "cancelled_at" timestamp with time zone,
    "channel" "text" DEFAULT 'manual'::"text" NOT NULL,
    "attribution" "jsonb",
    CONSTRAINT "bookings_channel_chk" CHECK (("channel" = ANY (ARRAY['manual'::"text", 'portal'::"text"]))),
    CONSTRAINT "bookings_currency_rate_chk" CHECK (((("currency" = 'MXN'::"text") AND ("exchange_rate" IS NULL)) OR (("currency" = 'USD'::"text") AND ("exchange_rate" IS NOT NULL) AND ("exchange_rate" > (0)::numeric))))
);


ALTER TABLE "ketzal"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "ketzal"."bookings"."marketplace_customer_id" IS 'Comprador B2C que originó el pedido (marketplace). Null = venta de agente. Liga al comprador y marca origen para la bandeja de pedidos (B.3).';



COMMENT ON COLUMN "ketzal"."bookings"."attribution" IS 'ADR-0025: atribución de marketing (first-touch del cliente + ip/ua/fbp/fbc capturados al crear el pedido). Solo service role escribe. No es dinero.';



CREATE OR REPLACE FUNCTION "ketzal"."es_staff_de_booking"("p_booking" "ketzal"."bookings") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(
    ketzal.is_superadmin()
    or (ketzal.is_active() and (
          p_booking.selling_supplier_id = ketzal.my_supplier_id()
       or p_booking.owner_supplier_id  = ketzal.my_supplier_id()
       or p_booking.sold_by = auth.uid())), false);
$$;


ALTER FUNCTION "ketzal"."es_staff_de_booking"("p_booking" "ketzal"."bookings") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."expenses_summary"("p_from" "date", "p_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id(); v_uid uuid := auth.uid();
begin
  with scoped as (
    select e.category, e.spent_at,
      case when e.kind = 'egreso' then e.amount_mxn else -e.amount_mxn end as neto
    from ketzal.expenses e
    where e.spent_at >= p_from and e.spent_at <= p_to
      and (v_super or (v_sup is not null and e.supplier_id = v_sup) or e.created_by = v_uid)
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
end $$;


ALTER FUNCTION "ketzal"."expenses_summary"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."find_auth_user_id"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;


ALTER FUNCTION "ketzal"."find_auth_user_id"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."generate_marketplace_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_total numeric; v_travel date; v_supplier uuid; v_mc uuid; v_final date;
  v_plan jsonb; v_item jsonb;
  v_channel text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select total, travel_date, selling_supplier_id, marketplace_customer_id, channel
    into v_total, v_travel, v_supplier, v_mc, v_channel
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_mc is null or v_mc <> v_uid then raise exception 'Pedido no encontrado o sin acceso'; end if;
  -- b091: el plan de una cotización del back-office lo fija el agente.
  if v_channel <> 'portal' then
    raise exception 'Este viaje lo lleva tu agencia: el plan de pagos va con ella.';
  end if;

  -- la salida manda; si no hay, la fecha que eligió el comprador
  v_final := coalesce(v_travel, p_final_date);
  if v_final is null then raise exception 'Elige una fecha límite para tu plan.'; end if;

  v_plan := ketzal._compute_payment_plan(v_total, current_date, v_final, p_frequency, 0.20);

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


ALTER FUNCTION "ketzal"."generate_marketplace_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."get_booking_checkout_key"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_mc uuid;
  v_key text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select selling_supplier_id, marketplace_customer_id
    into v_supplier, v_mc
    from ketzal.bookings where id = p_booking_id;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;

  select public_key into v_key from ketzal.mp_accounts where supplier_id = v_supplier;
  return jsonb_build_object('public_key', v_key, 'split', v_key is not null);
end
$$;


ALTER FUNCTION "ketzal"."get_booking_checkout_key"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_brand_logo"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$ select logo_url from ketzal.app_settings where id = 1 $$;


ALTER FUNCTION "ketzal"."get_brand_logo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_departure_detail"("p_departure_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
  v_uid uuid := auth.uid();
  d record;
begin
  select dep.id, dep.service_id, dep.departs_on, dep.max_capacity, dep.seats_taken, dep.note,
         s.name as service, s.supplier_id as owner_id,
         (select su.name from ketzal.suppliers su where su.id = s.supplier_id) as agency
    into d
    from ketzal.service_departures dep
    join ketzal.services s on s.id = dep.service_id
   where dep.id = p_departure_id;
  if not found then return null; end if;

  if not v_super and (d.owner_id is null or d.owner_id <> v_sup) then
    raise exception 'Sin acceso a esta salida';
  end if;

  select jsonb_build_object(
    'departure', jsonb_build_object(
      'id', d.id, 'service', d.service, 'agency', d.agency,
      'departs_on', d.departs_on, 'max_capacity', d.max_capacity,
      'seats_taken', d.seats_taken, 'note', d.note
    ),
    'totals', (
      select jsonb_build_object(
        'num_ventas', count(*),
        'num_pax', coalesce(sum(b.num_pax), 0),
        'pax_capturados', (select count(*) from ketzal.booking_passengers bp
                             join ketzal.bookings b2 on b2.id = bp.booking_id
                            where b2.service_id = d.service_id and b2.travel_date = d.departs_on
                              and b2.status in ('reserved','confirmed','paid'))
      )
      from ketzal.bookings b
      where b.service_id = d.service_id and b.travel_date = d.departs_on
        and b.status in ('reserved','confirmed','paid')
    ),
    'money', (
      select jsonb_build_object(
        'vendido_propio', coalesce(sum(b.total), 0),
        'cobrado_propio', coalesce(sum(c.cobrado), 0),
        'saldo_propio',   coalesce(sum(round(b.total - c.cobrado, 2)), 0)
      )
      from ketzal.bookings b
      cross join lateral (
        select coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                                 when p.type = 'refund'  then -p.amount_mxn else 0 end), 0) as cobrado
        from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'
      ) c
      where b.service_id = d.service_id and b.travel_date = d.departs_on
        and b.status in ('reserved','confirmed','paid')
        and (v_super or b.selling_supplier_id = v_sup or b.sold_by = v_uid)
    ),
    'bookings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'folio', b.folio,
        'customer', (select cu.full_name from ketzal.customers cu where cu.id = b.customer_id),
        'num_pax', b.num_pax, 'status', b.status,
        'is_own', mine.own,
        'selling_agency', (select su2.name from ketzal.suppliers su2 where su2.id = b.selling_supplier_id),
        'total',   case when mine.own then b.total else null end,
        'cobrado', case when mine.own then c.cobrado else null end,
        'saldo',   case when mine.own then round(b.total - c.cobrado, 2) else null end,
        'passengers', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', bp.id, 'full_name', bp.full_name,
            'passenger_type', bp.passenger_type, 'doc_id', bp.doc_id
          ) order by bp.created_at), '[]'::jsonb)
          from ketzal.booking_passengers bp where bp.booking_id = b.id
        )
      ) order by b.created_at), '[]'::jsonb)
      from ketzal.bookings b
      cross join lateral (
        select (v_super or b.selling_supplier_id = v_sup or b.sold_by = v_uid) as own
      ) mine
      cross join lateral (
        select coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                                 when p.type = 'refund'  then -p.amount_mxn else 0 end), 0) as cobrado
        from ketzal.payments p where p.booking_id = b.id and p.status = 'COMPLETED'
      ) c
      where b.service_id = d.service_id and b.travel_date = d.departs_on
        and b.status in ('reserved','confirmed','paid')
    )
  ) into v;

  return v;
end $$;


ALTER FUNCTION "ketzal"."get_departure_detail"("p_departure_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_my_trip"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select jsonb_build_object(
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status::text, 'travel_date', b.travel_date,
      'num_pax', b.num_pax, 'payment_type', b.payment_type,
      'channel', b.channel),  -- b091
    'money', jsonb_build_object('total', bwb.total, 'paid', bwb.paid, 'balance', bwb.balance),
    'service', jsonb_build_object(
      'name', coalesce(sv.name, 'Viaje'), 'description', sv.description,
      'location', sv.location, 'city_from', sv.city_from, 'state_from', sv.state_from,
      'city_to', sv.city_to, 'state_to', sv.state_to,
      'images', coalesce(sv.images, '[]'::jsonb),
      'includes', coalesce(sv.includes, '[]'::jsonb),
      'excludes', coalesce(sv.excludes, '[]'::jsonb),
      'itinerary', coalesce(sv.itinerary, '[]'::jsonb),
      'faqs', coalesce(sv.faqs, '[]'::jsonb)),
    'agency', case when sup.id is null then null else jsonb_build_object(
      'name', sup.name, 'phone', sup.phone_number, 'email', sup.contact_email, 'logo', sup.img_logo) end,
    'voucher_id', vch.id
  ) into v
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.services sv on sv.id = b.service_id
  left join ketzal.suppliers sup on sup.id = sv.supplier_id
  left join ketzal.vouchers vch on vch.booking_id = b.id
  where b.id = p_booking_id and b.marketplace_customer_id = v_uid and b.status <> 'cancelled';
  return v;
end $$;


ALTER FUNCTION "ketzal"."get_my_trip"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select case
           when b.currency = 'USD' and b.exchange_rate is not null and b.exchange_rate > 0
           then jsonb_build_object('currency', b.currency, 'exchange_rate', b.exchange_rate)
           else null
         end
  from ketzal.bookings b
  where b.id = (
    select case
      when p_kind = 'quote'     then (select bq.id from ketzal.bookings bq where bq.quote_token = p_id)
      when p_kind = 'statement' then (select bs.id from ketzal.bookings bs
                                        where bs.statement_token = p_id and bs.status <> 'draft')
      when p_kind = 'receipt'   then (select r.booking_id from ketzal.receipts r where r.id = p_id)
      else null::uuid
    end
  );
$$;


ALTER FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_poll ketzal.polls;
  v_sup record;
  v_cerrada boolean;
begin
  if p_id is null then return null; end if;

  select * into v_poll from ketzal.polls where id = p_id and status <> 'draft';
  if not found then return null; end if;

  select name, img_logo into v_sup from ketzal.suppliers where id = v_poll.supplier_id;

  v_cerrada := v_poll.status = 'closed'
               or (v_poll.closes_at is not null and v_poll.closes_at < current_date);

  return jsonb_build_object(
    'id', v_poll.id,
    'question', v_poll.question,
    'options', v_poll.options,
    'month_from', v_poll.month_from,
    'month_to', v_poll.month_to,
    'closes_at', v_poll.closes_at,
    'status_efectivo', case when v_cerrada then 'closed' else 'open' end,
    'agency', jsonb_build_object('name', v_sup.name, 'logo', v_sup.img_logo),
    'total_votes', (select count(*) from ketzal.poll_votes v where v.poll_id = v_poll.id),
    'by_option', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.option_id, 'votes', t.n) order by t.n desc)
        from (select option_id, count(*) as n from ketzal.poll_votes
               where poll_id = v_poll.id group by option_id) t
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', t.m, 'votes', t.n) order by t.m)
        from (select to_char(preferred_month, 'YYYY-MM') as m, count(*) as n
                from ketzal.poll_votes where poll_id = v_poll.id
               group by 1) t
    ), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") OWNER TO "postgres";


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
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides,
                        'note', d.note
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date
               and d.seats_taken < d.max_capacity
           ), '[]'::jsonb) as departures,
           coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'id', d.id,
                        'departs_on', d.departs_on,
                        'free', d.max_capacity - d.seats_taken,
                        'price_pct', d.price_pct,
                        'pack_price_overrides', d.pack_price_overrides,
                        'note', d.note
                      ) order by d.departs_on)
             from ketzal.service_departures d
             where d.service_id = s.id
               and d.departs_on >= current_date - interval '180 days'
           ), '[]'::jsonb) as all_departures,
           jsonb_build_object(
             'id', sup.id,
             'name', sup.name, 'logo', sup.img_logo,
             'email', sup.contact_email, 'phone', sup.phone_number
           ) as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    where s.id = p_id and s.published
  ) t;
$$;


ALTER FUNCTION "ketzal"."get_public_service"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_public_supplier"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select to_jsonb(t) from (
    select
      sup.id,
      sup.name,
      sup.img_logo as logo,
      coalesce(sup.photos, '[]'::jsonb) as photos,
      coalesce(sup.info, '{}'::jsonb) as info,
      (select count(*)::int from ketzal.services s
         where s.supplier_id = sup.id and s.published) as active_trips,
      coalesce((
        select jsonb_agg(distinct q.dest order by q.dest)
        from (
          select coalesce(nullif(trim(s.city_to), ''), nullif(trim(s.state_to), '')) as dest
          from ketzal.services s
          where s.supplier_id = sup.id and s.published
        ) q
        where q.dest is not null
      ), '[]'::jsonb) as destinations,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', s.id,
                   'name', s.name,
                   'price', s.price,
                   'image', s.images->>'imgBanner',
                   'city_to', s.city_to,
                   'state_to', s.state_to
                 ) order by s.name)
        from ketzal.services s
        where s.supplier_id = sup.id and s.published
      ), '[]'::jsonb) as trips
    from ketzal.suppliers sup
    where sup.id = p_id
      and exists (
        select 1 from ketzal.services s
        where s.supplier_id = sup.id and s.published
      )
  ) t;
$$;


ALTER FUNCTION "ketzal"."get_public_supplier"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


CREATE OR REPLACE FUNCTION "ketzal"."get_service_reviews"("p_service_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  with r as (
    select rt.rating, rt.comment, rt.created_at,
           split_part(coalesce(mc.name, 'Viajero'), ' ', 1) as autor
    from ketzal.ratings rt
    join ketzal.bookings b on b.id = rt.booking_id
    left join ketzal.profiles mc on mc.id = b.marketplace_customer_id and mc.type = 'viajero'
    where rt.kind = 'traveler_to_provider' and b.service_id = p_service_id
  )
  select jsonb_build_object(
    'count', count(*),
    'avg', round(coalesce(avg(rating), 0), 1),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'rating', rating, 'comment', comment, 'autor', autor, 'created_at', created_at)
      order by created_at desc), '[]'::jsonb)
  ) from r;
$$;


ALTER FUNCTION "ketzal"."get_service_reviews"("p_service_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."get_supplier_rating"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  with r as (
    select ketzal.get_service_reviews(s.id) as rev
    from ketzal.services s
    where s.supplier_id = p_id and s.published
  ),
  agg as (
    select
      coalesce(sum((rev->>'count')::int), 0) as total,
      coalesce(sum((rev->>'avg')::numeric * (rev->>'count')::int), 0) as weighted
    from r
    where (rev->>'count')::int > 0
  )
  select jsonb_build_object(
    'count', agg.total,
    'avg', case when agg.total > 0 then round(agg.weighted / agg.total, 1) else 0 end
  )
  from agg;
$$;


ALTER FUNCTION "ketzal"."get_supplier_rating"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."get_voucher_public"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select jsonb_build_object(
    'agencia',      coalesce(s.name, 'Ketzal'),
    'logo',         s.img_logo,
    'email',        s.contact_email,
    'telefono',     s.phone_number,
    'folio',        v.folio,
    'fecha_emision',v.created_at,
    'cliente',      c.full_name,
    'servicio',     coalesce(srv.name, 'Viaje'),
    'fecha_viaje',  b.travel_date,
    'pax',          b.num_pax,
    'estado',       b.status,
    'pasajeros',    coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', bp.full_name, 'passenger_type', bp.passenger_type,
        'seat', sa.seat_number
      ) order by bp.created_at)
      from ketzal.booking_passengers bp
      left join ketzal.seat_assignments sa on sa.passenger_id = bp.id
      where bp.booking_id = b.id
    ), '[]'::jsonb)
  )
  from ketzal.vouchers v
  join ketzal.bookings b on b.id = v.booking_id
  left join ketzal.customers c   on c.id   = b.customer_id
  left join ketzal.services  srv on srv.id = b.service_id
  left join ketzal.suppliers s   on s.id   = v.supplier_id
  where v.id = p_id
    and b.status <> 'cancelled';
$$;


ALTER FUNCTION "ketzal"."get_voucher_public"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."global_search"("p_q" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
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


CREATE OR REPLACE FUNCTION "ketzal"."goals_progress"("p_month" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v jsonb;
  v_super boolean := ketzal.is_superadmin();
  v_sup uuid := ketzal.my_supplier_id();
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not v_super and v_sup is null then return '{}'::jsonb; end if;

  with vendido as (
    select b.sold_by as agent_id, coalesce(sum(b.total), 0) as vendido, count(*) as num
    from ketzal.bookings b
    where b.status in ('reserved','confirmed','paid')
      and b.created_at >= m_start and b.created_at < m_end
      and (v_super or b.selling_supplier_id = v_sup)
    group by b.sold_by
  ),
  metas as (
    select g.agent_id, g.goal_amount
    from ketzal.sales_goals g
    where g.month = m_start and (v_super or g.supplier_id = v_sup)
  )
  select jsonb_build_object(
    'month', to_char(m_start, 'YYYY-MM'),
    'agencia', jsonb_build_object(
      'goal', coalesce((select goal_amount from metas where agent_id is null), 0),
      'vendido', coalesce((select sum(vendido) from vendido), 0)
    ),
    'agentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agent_id', p.id,
        'agente', coalesce(p.name, p.email, 'Agente'),
        'goal', coalesce(mt.goal_amount, 0),
        'vendido', coalesce(vd.vendido, 0),
        'avance', case when coalesce(mt.goal_amount,0) > 0
                       then round(100.0 * coalesce(vd.vendido,0) / mt.goal_amount, 1) else null end
      ) order by coalesce(vd.vendido,0) desc)
      from ketzal.profiles p
      left join metas mt on mt.agent_id = p.id
      left join vendido vd on vd.agent_id = p.id
      where (v_super or p.supplier_id = v_sup)
        and (mt.goal_amount is not null or vd.vendido is not null)
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."goals_progress"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."invite_agent"("p_email" "text", "p_role" "ketzal"."user_role" DEFAULT 'user'::"ketzal"."user_role", "p_supplier" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $_$
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
end $_$;


ALTER FUNCTION "ketzal"."invite_agent"("p_email" "text", "p_role" "ketzal"."user_role", "p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_active"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce((select active from ketzal.profiles where id = auth.uid()), false)
         or ketzal.is_superadmin()
$$;


ALTER FUNCTION "ketzal"."is_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_admin_de_embajador"("p_profile" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(
    (select ketzal.is_agency_admin(p.supplier_id)
       from ketzal.profiles p
      where p.id = p_profile
        and p.type = 'embajador'
        and p.supplier_id is not null),
    false)
$$;


ALTER FUNCTION "ketzal"."is_admin_de_embajador"("p_profile" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_agency_admin"("p_supplier" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select exists (
    select 1 from ketzal.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.active
      and p.supplier_id = p_supplier
  );
$$;


ALTER FUNCTION "ketzal"."is_agency_admin"("p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_ambassador"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select exists(select 1 from ketzal.profiles p where p.id = p_id and p.type = 'embajador');
$$;


ALTER FUNCTION "ketzal"."is_ambassador"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_free_agent"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select exists (
    select 1 from ketzal.profiles
     where id = auth.uid()
       and type = 'agente'
       and supplier_id is null
       and active
  );
$$;


ALTER FUNCTION "ketzal"."is_free_agent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select exists (select 1 from ketzal.profiles where id = auth.uid() and role = 'superadmin');
$$;


ALTER FUNCTION "ketzal"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ledger_post"("p_entries" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."ledger_post"("p_entries" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ledger_statement"("p_account_type" "text", "p_supplier" "uuid" DEFAULT NULL::"uuid", "p_profile" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
  v_admin boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_admin := exists (select 1 from ketzal.profiles p
                     where p.id = v_uid and p.role = 'admin' and p.active);
  if not v_super then
    if p_account_type = 'agencia' then
      if not (v_admin and p_supplier = v_supplier) then
        raise exception 'Sin acceso a esa cuenta.';
      end if;
    elsif p_account_type in ('embajador','viajero','agente') then
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
        and (p_account_type not in ('embajador','viajero','agente') or le.account_profile_id = p_profile)
      order by le.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) m
  );
end $$;


ALTER FUNCTION "ketzal"."ledger_statement"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."ledger_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."ledger_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."link_my_customers"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from ketzal.profiles p where p.id = v_uid) then return 0; end if;
  return ketzal.link_profile_customers(v_uid);
end $$;


ALTER FUNCTION "ketzal"."link_my_customers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."link_profile_customers"("p_uid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_email text; v_n int := 0;
begin
  if p_uid is null or not ketzal.email_verificado(p_uid) then return 0; end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_uid;
  if v_email is null then return 0; end if;

  -- Una fila por agencia (la más antigua): `uq_customers_supplier_marketplace`
  -- no admite dos filas de la misma agencia apuntando al mismo perfil. Y si esa
  -- agencia ya tiene una fila ligada a este perfil (compró por el portal), la del
  -- agente no se toca.
  -- ponytail: la fila duplicada queda sin ligar; el dedup de clientes es otro carril.
  with cand as (
    select distinct on (c.supplier_id) c.id
      from ketzal.customers c
     where c.marketplace_customer_id is null
       and lower(c.email) = v_email
       and not exists (select 1 from ketzal.customers c2
                        where c2.supplier_id is not distinct from c.supplier_id
                          and c2.marketplace_customer_id = p_uid)
     order by c.supplier_id, c.created_at, c.id
  ), upd as (
    update ketzal.customers c set marketplace_customer_id = p_uid
     where c.id in (select id from cand)
     returning c.id
  )
  select count(*) into v_n from upd;

  update ketzal.bookings b set marketplace_customer_id = p_uid
   where b.marketplace_customer_id is null
     and b.customer_id in (select c.id from ketzal.customers c
                            where c.marketplace_customer_id = p_uid);
  return v_n;
end $$;


ALTER FUNCTION "ketzal"."link_profile_customers"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_agencies_to_join"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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


ALTER FUNCTION "ketzal"."list_agencies_to_join"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_agency_invitations"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'email', i.email, 'role', i.role, 'supplier_id', i.supplier_id,
      'agency', s.name, 'created_at', i.created_at
    ) order by i.created_at desc), '[]'::jsonb)
  from ketzal.agency_invitations i
  left join ketzal.suppliers s on s.id = i.supplier_id
  where i.status = 'pending'
    and (ketzal.is_superadmin() or i.supplier_id = ketzal.my_supplier_id());
$$;


ALTER FUNCTION "ketzal"."list_agency_invitations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_agency_names"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from ketzal.suppliers where supplier_type = 'agency';
$$;


ALTER FUNCTION "ketzal"."list_agency_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_agents_for_commission"("p_supplier" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "name" "text", "basis" "text", "rate" numeric, "unit_amount" numeric, "referral_code" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_supplier uuid;
begin
  if not ketzal.is_active() then raise exception 'Cuenta pendiente de aprobación.'; end if;
  if ketzal.is_superadmin() then
    v_supplier := coalesce(p_supplier, ketzal.my_supplier_id());
  else
    if not exists (select 1 from ketzal.profiles me where me.id = auth.uid() and me.role = 'admin') then
      raise exception 'Sin permiso.';
    end if;
    v_supplier := ketzal.my_supplier_id();
  end if;
  if v_supplier is null then return; end if;
  return query
    select p.id, coalesce(p.name, 'Agente') as name, r.basis, r.rate, r.unit_amount,
           p.referral_code
    from ketzal.profiles p
    left join ketzal.commission_rules r
      on r.payee_type = 'agente' and r.scope_profile_id = p.id
      and r.service_id is null and r.active
    where p.type = 'agente' and p.supplier_id = v_supplier and p.active
    order by name;
end $$;


ALTER FUNCTION "ketzal"."list_agents_for_commission"("p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_ambassadors"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb; v_sup uuid;
begin
  if not ketzal.is_active() then return '[]'::jsonb; end if;

  if ketzal.is_superadmin() then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'referral_code', referral_code,
      'supplier_id', supplier_id) order by name), '[]'::jsonb)
      into v
      from ketzal.profiles
     where type = 'embajador';
    return v;
  end if;

  v_sup := ketzal.my_supplier_id();
  if v_sup is null or not coalesce(ketzal.is_agency_admin(v_sup), false) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'referral_code', p.referral_code,
    'supplier_id', p.supplier_id) order by p.name), '[]'::jsonb)
    into v
    from ketzal.profiles p
   where p.type = 'embajador'
     and (
       p.supplier_id = v_sup
       or exists (
         select 1 from ketzal.bookings b
          where b.ambassador_id = p.id
            and b.selling_supplier_id = v_sup
            and b.status in ('reserved','confirmed','paid')
       )
     );
  return v;
end $$;


ALTER FUNCTION "ketzal"."list_ambassadors"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_customer_credits"("p_customer" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_cu ketzal.customers;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_cu from ketzal.customers where id = p_customer;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_cu.supplier_id = ketzal.my_supplier_id(), false)) then
    raise exception 'Sin acceso a este cliente';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'agencia', s.name,
      'monto_mxn', c.amount_mxn,
      'saldo_mxn', round(c.amount_mxn - coalesce((
         select sum(p.amount_mxn) from ketzal.payments p
          where p.credit_id = c.id and p.status = 'COMPLETED'), 0), 2),
      'expira', c.expires_at
    ) order by c.expires_at), '[]'::jsonb)
    from ketzal.credits c
    join ketzal.suppliers s on s.id = c.supplier_id
    join ketzal.customers cu on cu.id = c.customer_id
    where current_date < c.expires_at
      -- Solo créditos emitidos por MI agencia (o todos, si superadmin): el
      -- saldo que otra agencia le emitió a la persona no es asunto mío y
      -- tampoco puedo canjearlo.
      and (ketzal.is_superadmin() or c.supplier_id = ketzal.my_supplier_id())
      and (c.customer_id = p_customer
           or (v_cu.marketplace_customer_id is not null
               and cu.marketplace_customer_id = v_cu.marketplace_customer_id))
  );
end $$;


ALTER FUNCTION "ketzal"."list_customer_credits"("p_customer" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."list_departures"("p_from" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb; v_super boolean := ketzal.is_superadmin(); v_sup uuid := ketzal.my_supplier_id();
begin
  if not v_super and v_sup is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            d.id,
    'service_id',    d.service_id,
    'service',       s.name,
    'departs_on',    d.departs_on,
    'max_capacity',  d.max_capacity,
    'seats_taken',   d.seats_taken,
    'note',          d.note,
    'num_ventas', (select count(*) from ketzal.bookings b
                     where b.service_id = d.service_id and b.travel_date = d.departs_on
                       and b.status in ('reserved','confirmed','paid')),
    'pax_capturados', (select count(*) from ketzal.booking_passengers bp
                         join ketzal.bookings b on b.id = bp.booking_id
                        where b.service_id = d.service_id and b.travel_date = d.departs_on
                          and b.status in ('reserved','confirmed','paid'))
  ) order by d.departs_on asc), '[]'::jsonb) into v
  from ketzal.service_departures d
  join ketzal.services s on s.id = d.service_id
  where d.departs_on >= p_from and (v_super or s.supplier_id = v_sup);

  return v;
end $$;


ALTER FUNCTION "ketzal"."list_departures"("p_from" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_join_requests"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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


ALTER FUNCTION "ketzal"."list_join_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_my_credits"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'agencia', s.name,
    'monto_mxn', c.amount_mxn,
    'saldo_mxn', round(c.amount_mxn - coalesce((
       select sum(p.amount_mxn) from ketzal.payments p
        where p.credit_id = c.id and p.status = 'COMPLETED'), 0), 2),
    'expira', c.expires_at,
    'vigente', current_date < c.expires_at
  ) order by c.expires_at), '[]'::jsonb)
  from ketzal.credits c
  join ketzal.customers cu on cu.id = c.customer_id
  join ketzal.suppliers s on s.id = c.supplier_id
  where cu.marketplace_customer_id = auth.uid();
$$;


ALTER FUNCTION "ketzal"."list_my_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_my_marketplace_orders"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        b.id as booking_id, b.service_id, b.status::text as status, b.travel_date,
        b.payment_type, b.created_at,
        -- b091: 'portal' | 'manual' — la UI esconde pagar/borrar en las manuales.
        b.channel,
        coalesce(sv.name, 'Viaje') as service_name,
        bwb.total, bwb.paid, bwb.balance,
        case
          when bwb.balance <= 0 then 0
          when b.payment_type = 'abonos' then coalesce((
            select least(bwb.balance, x.cum - bwb.paid)
            from (select ps.seq, sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) x
            where x.cum > bwb.paid order by x.seq limit 1
          ), bwb.balance)
          else bwb.balance
        end as next_due,
        case
          when bwb.balance > 0 and b.payment_type = 'abonos' then (
            select y.due_date
            from (select ps.seq, ps.due_date, sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) y
            where y.cum > bwb.paid order by y.seq limit 1)
          else null
        end as next_due_date,
        (b.status = 'paid' and (b.travel_date is null or b.travel_date <= current_date)) as can_rate,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as rated_provider,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as rated_app,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_rating,
        (select r.comment from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_comment,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as app_rating,
        case
          when bwb.balance > 0 and coalesce(sp.info->>'spei_clabe','') <> '' then
            jsonb_build_object(
              'clabe',   sp.info->>'spei_clabe',
              'banco',   sp.info->>'spei_banco',
              'titular', sp.info->>'spei_titular',
              'cuenta',  sp.info->>'spei_cuenta',
              'tarjeta', sp.info->>'spei_tarjeta',
              'agencia', sp.name)
          else null
        end as spei,
        (select pi.amount from ketzal.payment_intents pi
          where pi.booking_id = b.id and pi.provider = 'spei' and pi.status = 'pending'
          limit 1) as spei_pending,
        -- b039: plan de pagos del pedido (checklist del viajero).
        case
          when b.payment_type = 'abonos' then (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'seq', z.seq, 'kind', z.kind, 'due_date', z.due_date,
                     'amount', z.amount, 'cum', z.cum) order by z.seq), '[]'::jsonb)
            from (select ps.seq, ps.kind, ps.due_date, ps.amount,
                         sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) z
          )
          else null
        end as plan
      from ketzal.bookings b
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.services sv on sv.id = b.service_id
      left join ketzal.suppliers sp on sp.id = b.selling_supplier_id
      where b.marketplace_customer_id = v_uid and b.status <> 'cancelled'
    ) o
  );
end $$;


ALTER FUNCTION "ketzal"."list_my_marketplace_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_my_passengers"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1 from ketzal.bookings b
    where b.id = p_booking_id and b.marketplace_customer_id = v_uid
  ) then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
    from (
      select bp.id, bp.full_name, bp.passenger_type, bp.doc_id, bp.created_at
      from ketzal.booking_passengers bp
      where bp.booking_id = p_booking_id
    ) x
  );
end $$;


ALTER FUNCTION "ketzal"."list_my_passengers"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_pending_spei"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not v_super and not exists (
    select 1 from ketzal.profiles p
    where p.id = v_uid and p.role = 'admin' and p.active
  ) then
    raise exception 'Solo un admin puede revisar transferencias.';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
    from (
      select pi.id, pi.booking_id, pi.amount, pi.mp_payment_id as reference,
             pi.receipt_url, pi.created_at,
             coalesce(c.full_name, 'Comprador') as cliente,
             coalesce(sv.name, 'Viaje') as servicio,
             b.status::text as booking_status,
             bwb.total, bwb.balance
      from ketzal.payment_intents pi
      join ketzal.bookings b on b.id = pi.booking_id
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.customers c on c.id = b.customer_id
      left join ketzal.services sv on sv.id = b.service_id
      where pi.provider = 'spei' and pi.status = 'pending'
        and (v_super or pi.supplier_id = v_supplier)
    ) x
  );
end $$;


ALTER FUNCTION "ketzal"."list_pending_spei"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."list_public_suppliers"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  select coalesce(
    jsonb_agg(to_jsonb(t) order by t.active_trips desc, t.name),
    '[]'::jsonb
  )
  from (
    select
      sup.id,
      sup.name,
      sup.img_logo as logo,
      nullif(trim(sup.info->>'city_zone'), '') as city_zone,
      coalesce(sup.info->'specialties', '[]'::jsonb) as specialties,
      (
        select count(*)::int
        from ketzal.services s
        where s.supplier_id = sup.id and s.published
      ) as active_trips,
      ketzal.get_supplier_rating(sup.id) as rating
    from ketzal.suppliers sup
    where exists (
      select 1 from ketzal.services s
      where s.supplier_id = sup.id and s.published
    )
  ) t;
$$;


ALTER FUNCTION "ketzal"."list_public_suppliers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_rejected_spei"("p_days" integer DEFAULT 14) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not v_super and not exists (
    select 1 from ketzal.profiles p
    where p.id = v_uid and p.role = 'admin' and p.active
  ) then
    raise exception 'Solo un admin puede revisar transferencias.';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
    from (
      select pi.id, pi.booking_id, pi.amount, pi.mp_payment_id as reference,
             pi.receipt_url, pi.created_at, pi.updated_at,
             coalesce(c.full_name, 'Comprador') as cliente,
             coalesce(sv.name, 'Viaje') as servicio,
             b.status::text as booking_status,
             bwb.balance
      from ketzal.payment_intents pi
      join ketzal.bookings b on b.id = pi.booking_id
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.customers c on c.id = b.customer_id
      left join ketzal.services sv on sv.id = b.service_id
      where pi.provider = 'spei' and pi.status = 'rejected'
        and pi.updated_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
        and (v_super or pi.supplier_id = v_supplier)
    ) x
  );
end $$;


ALTER FUNCTION "ketzal"."list_rejected_spei"("p_days" integer) OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."list_traveler_purchases"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          b.id,
    'folio',       b.folio,
    'service',     (select s.name from ketzal.services s  where s.id = b.service_id),
    'agency',      (select su.name from ketzal.suppliers su where su.id = b.selling_supplier_id),
    'travel_date', b.travel_date,
    'status',      b.status,
    'total',       b.total,
    'cobrado',     c.cobrado,
    'saldo',       round(b.total - c.cobrado, 2),
    'ultimo_pago', c.ultimo_pago,
    'num_pagos',   c.num_pagos,
    'created_at',  b.created_at
  ) order by b.created_at desc), '[]'::jsonb) into v
  from ketzal.bookings b
  cross join lateral (
    select
      coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                        when p.type = 'refund'  then -p.amount_mxn
                        else 0 end), 0) as cobrado,
      max(case when p.type = 'payment' then coalesce(p.paid_at, p.created_at) end) as ultimo_pago,
      count(*) filter (where p.type = 'payment') as num_pagos
    from ketzal.payments p
    where p.booking_id = b.id and p.status = 'COMPLETED'
  ) c
  where b.marketplace_customer_id = p_id;

  return v;
end $$;


ALTER FUNCTION "ketzal"."list_traveler_purchases"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_travelers"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'full_name',   m.name,
    'email',       m.email,
    'phone',       m.phone,
    'image',       m.image,
    'created_at',  m.created_at,
    'num_compras', (select count(*) from ketzal.bookings b
                     where b.marketplace_customer_id = m.id)
  ) order by m.created_at desc), '[]'::jsonb) into v
  from ketzal.profiles m
  where m.type = 'viajero';

  return v;
end $$;


ALTER FUNCTION "ketzal"."list_travelers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."list_users"("p_q" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."list_users"("p_q" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
  insert into ketzal.system_log(source, level, event, detail) values (p_source, p_level, p_event, p_detail);
$$;


ALTER FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."log_user_event"("p_user" "uuid", "p_kind" "text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_ip" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
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


ALTER FUNCTION "ketzal"."log_user_event"("p_user" "uuid", "p_kind" "text", "p_meta" "jsonb", "p_ip" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."marcar_onboarding_visto"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_at timestamptz;
begin
  if auth.uid() is null then return null; end if;
  update ketzal.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid()
  returning onboarded_at into v_at;
  return v_at;
end $$;


ALTER FUNCTION "ketzal"."marcar_onboarding_visto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."mp_account_status"("p_supplier" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_superadmin() and not ketzal.is_agency_admin(p_supplier) then
    raise exception 'Sin acceso.';
  end if;
  return coalesce((
    select jsonb_build_object('connected', true, 'mp_user_id', a.mp_user_id,
                              'connected_at', a.connected_at)
    from ketzal.mp_accounts a where a.supplier_id = p_supplier
  ), jsonb_build_object('connected', false));
end $$;


ALTER FUNCTION "ketzal"."mp_account_status"("p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_ambassador_earnings"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v jsonb; v_bono numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() not in ('embajador', 'agente') then
    raise exception 'Solo para quien puede referir';
  end if;

  v_bono := ketzal.bonos_reclutador(v_uid);

  with dev as (
    select cl.amount_mxn, cl.kind, b.status, b.travel_date, b.created_at,
           (select name from ketzal.services s where s.id = b.service_id) as servicio
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.payee_type = 'embajador' and cl.payee_profile_id = v_uid
      and b.status in ('reserved','confirmed','paid')
  ),
  earn as (select coalesce(sum(case when kind='devengo' then amount_mxn else -amount_mxn end),0) as devengado from dev),
  pag as (
    select coalesce(sum(case when kind='egreso' then amount_mxn else -amount_mxn end),0) as pagado
    from ketzal.expenses where category in ('embajador','agente') and provider_profile_id = v_uid
  )
  select jsonb_build_object(
    'referral_code', (select referral_code from ketzal.profiles where id = v_uid),
    'devengado', (select devengado from earn) + v_bono,
    'comisiones', (select devengado from earn),
    'bonos', v_bono,
    'num_reclutas', (select count(*) from ketzal.profiles r where r.recruited_by = v_uid),
    'pagado',    (select pagado from pag),
    'saldo',     (select devengado from earn) + v_bono - (select pagado from pag),
    'num_ventas',(select count(*) filter (where kind='devengo') from dev),
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'servicio', servicio, 'fecha', travel_date, 'status', status, 'comision', amount_mxn)
        order by created_at desc)
      from dev where kind='devengo'), '[]'::jsonb)
  ) into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."my_ambassador_earnings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_ambassador_payments"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha', e.spent_at,
           'monto', case when e.kind = 'egreso' then e.amount_mxn else -e.amount_mxn end,
           'concepto', e.concept,
           'metodo', e.method,
           'agencia', (select s.name from ketzal.suppliers s where s.id = e.supplier_id)
         ) order by e.spent_at desc, e.created_at desc), '[]'::jsonb)
  from ketzal.expenses e
  where e.category in ('embajador','agente')
    and e.provider_profile_id = auth.uid();
$$;


ALTER FUNCTION "ketzal"."my_ambassador_payments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_link_clicks"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
with yo as (
  select id, referral_code from ketzal.profiles where id = auth.uid()
),
mios as (
  select fe.session_id, fe.service_id
  from ketzal.funnel_events fe
  join yo on yo.referral_code is not null
         and upper(fe.meta->>'ref') = yo.referral_code
  where fe.event = 'link_click'
),
clics as (
  select service_id, count(distinct session_id)::int as clics
  from mios group by service_id
),
cotizando as (
  select b.service_id, count(*)::int as n
  from ketzal.bookings b
  join yo on b.ambassador_id = yo.id
  where b.status = 'draft'
  group by b.service_id
),
juntos as (
  select coalesce(c.service_id, q.service_id) as service_id,
         coalesce(c.clics, 0) as clics,
         coalesce(q.n, 0) as cotizando
  from clics c
  full outer join cotizando q on q.service_id = c.service_id
)
select jsonb_build_object(
  -- PERSONAS, no suma de conteos: quien ve la vitrina y dos tours es UNA.
  'total_clics', (select count(distinct session_id)::int from mios),
  'en_cotizacion', coalesce((select sum(n) from cotizando), 0),
  'por_servicio', coalesce((
    select jsonb_agg(jsonb_build_object(
             'service_id', j.service_id,
             'nombre', s.name,
             'clics', j.clics,
             'cotizando', j.cotizando)
           order by j.clics desc, j.cotizando desc)
    from juntos j
    left join ketzal.services s on s.id = j.service_id
    where j.service_id is not null
  ), '[]'::jsonb)
)
from yo;
$$;


ALTER FUNCTION "ketzal"."my_link_clicks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_profile_type"() RETURNS "ketzal"."profile_type"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select type from ketzal.profiles where id = auth.uid();
$$;


ALTER FUNCTION "ketzal"."my_profile_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_provider_services"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  -- b060: lectura directa. `my_supplier_id()` ya sólo responde para staff de
  -- agencia, y un proveedor no lo es.
  v_sup uuid := (select supplier_id from ketzal.profiles where id = auth.uid());
  v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() <> 'proveedor' then raise exception 'Solo para proveedores'; end if;
  if v_sup is null then
    return jsonb_build_object('supplier', null, 'servicios', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'supplier', (select name from ketzal.suppliers s where s.id = v_sup),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'service_type', s.service_type,
        'city_to', s.city_to,
        'state_to', s.state_to,
        'published', s.published,
        'rol', case
          when s.supplier_id = v_sup then 'Dueño'
          when s.transport_provider_id = v_sup then 'Transporte'
          when s.hotel_provider_id = v_sup then 'Hospedaje'
          else '—' end)
        order by s.name)
      from ketzal.services s
      where s.supplier_id = v_sup
         or s.transport_provider_id = v_sup
         or s.hotel_provider_id = v_sup
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."my_provider_services"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."my_supplier_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select supplier_id from ketzal.profiles
   where id = auth.uid()
     and coalesce(type, 'agente') = 'agente';
$$;


ALTER FUNCTION "ketzal"."my_supplier_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."next_doc_folio"("p_supplier" "uuid", "p_series" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v bigint;
begin
  if not ketzal.puede_folear(p_supplier) then
    raise exception 'Sin acceso a los folios de esa agencia';
  end if;
  insert into ketzal.doc_counters(supplier_id, series, last_folio)
  values (p_supplier, p_series, 0) on conflict (supplier_id, series) do nothing;
  update ketzal.doc_counters set last_folio = last_folio + 1
   where supplier_id = p_supplier and series = p_series
  returning last_folio into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."next_doc_folio"("p_supplier" "uuid", "p_series" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v bigint;
begin
  if not ketzal.puede_folear(p_supplier) then
    raise exception 'Sin acceso a los folios de esa agencia';
  end if;
  insert into ketzal.receipt_counters(supplier_id, last_folio)
  values (p_supplier, 0) on conflict (supplier_id) do nothing;
  update ketzal.receipt_counters set last_folio = last_folio + 1
   where supplier_id = p_supplier
  returning last_folio into v;
  return v;
end $$;


ALTER FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."onboarding_agencia"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sup uuid := ketzal.my_supplier_id();
  v_admin boolean;
  s record;
  v_pasos jsonb;
  v_pend int;
begin
  if v_uid is null then return null; end if;
  if v_sup is null then return null; end if;   -- superadmin / agente libre
  v_admin := exists (select 1 from ketzal.profiles p
                      where p.id = v_uid and p.role in ('admin','superadmin') and p.active);
  if not v_admin then return null; end if;      -- el agente raso no configura la agencia

  select
    sup.name,
    -- Perfil: logo y un medio de contacto. Es lo que ve el viajero en la vitrina.
    (sup.img_logo is not null and coalesce(sup.phone_number, sup.contact_email) is not null) as perfil,
    (nullif(trim(coalesce(sup.info->>'clabe','')), '') is not null) as clabe,
    (select count(*) from ketzal.services sv where sv.supplier_id = v_sup) as n_serv,
    (select count(*) from ketzal.services sv
      where sv.supplier_id = v_sup and sv.published) as n_pub,
    (select count(*) from ketzal.service_departures sd
       join ketzal.services sv on sv.id = sd.service_id
      where sv.supplier_id = v_sup) as n_salidas,
    (select count(*) from ketzal.profiles p
      where p.supplier_id = v_sup and coalesce(p.type,'agente') = 'agente') as n_equipo,
    (select count(*) from ketzal.mp_accounts m where m.supplier_id = v_sup) as n_mp,
    (select count(*) from ketzal.bookings b where b.selling_supplier_id = v_sup) as n_ventas
  into s
  from ketzal.suppliers sup where sup.id = v_sup;

  if s is null then return null; end if;

  v_pasos := jsonb_build_array(
    jsonb_build_object('id','perfil', 'hecho', s.perfil,
      'titulo','Completa el perfil de tu agencia',
      'detalle','Logo y un teléfono o correo de contacto: es lo que ve el viajero en tu ficha pública.',
      'href','/proveedores', 'cta','Editar perfil'),
    jsonb_build_object('id','servicio', 'hecho', s.n_serv > 0,
      'titulo','Carga tu primer viaje',
      'detalle','Sin catálogo no hay nada que vender. Puedes capturarlo a mano o importarlo desde una imagen.',
      'href','/servicios/nuevo', 'cta','Crear viaje'),
    jsonb_build_object('id','salidas', 'hecho', s.n_salidas > 0,
      'titulo','Agrega fechas de salida',
      'detalle','Las salidas son las que controlan el cupo y arman el manifiesto del camión.',
      'href','/servicios', 'cta','Ver catálogo'),
    jsonb_build_object('id','publicar', 'hecho', s.n_pub > 0,
      'titulo','Publica un viaje en el catálogo',
      'detalle','Publicar lo hace visible en Ketzal para cualquier visitante, y revendible por otras agencias.',
      'href','/servicios', 'cta','Publicar'),
    jsonb_build_object('id','equipo', 'hecho', s.n_equipo > 1,
      'titulo','Invita a tus agentes',
      'detalle','Cada agente vende con su propia cuenta; sus ventas y comisiones quedan a su nombre.',
      'href','/equipo', 'cta','Invitar'),
    jsonb_build_object('id','clabe', 'hecho', s.clabe,
      'titulo','Pon tu CLABE para cobrar por transferencia',
      'detalle','El viajero transfiere directo a tu cuenta y tú apruebas el comprobante desde Cobranza.',
      'href','/proveedores', 'cta','Configurar'),
    jsonb_build_object('id','mercadopago', 'hecho', s.n_mp > 0,
      'titulo','Conecta tu Mercado Pago (opcional)',
      'detalle','Con tu cuenta conectada el dinero del cobro en línea te llega directo, sin pasar por Ketzal.',
      'href','/proveedores', 'cta','Conectar'),
    jsonb_build_object('id','venta', 'hecho', s.n_ventas > 0,
      'titulo','Registra tu primera venta',
      'detalle','Cierra una venta, registra el abono y emite el recibo: es el flujo completo del día a día.',
      'href','/ventas/nueva', 'cta','Nueva venta')
  );

  select count(*) into v_pend
    from jsonb_array_elements(v_pasos) p where (p->>'hecho')::boolean is not true;

  return jsonb_build_object(
    'agencia', s.name,
    'total', jsonb_array_length(v_pasos),
    'pendientes', v_pend,
    'pasos', v_pasos);
end $$;


ALTER FUNCTION "ketzal"."onboarding_agencia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."pagar_corte_embajador"("p_embajador" "uuid", "p_agencia" "uuid", "p_monto" numeric, "p_fecha" "date" DEFAULT CURRENT_DATE, "p_metodo" "text" DEFAULT 'transferencia'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_debido numeric; v_id uuid; v_concepto text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  -- Una agencia solo salda LO SUYO; el bono (sin agencia) lo paga Ketzal.
  if p_agencia is null then
    if not ketzal.is_superadmin() then
      raise exception 'El bono por reclutar lo paga Ketzal; una agencia no puede registrarlo.';
    end if;
  elsif not (ketzal.is_superadmin() or coalesce(ketzal.is_agency_admin(p_agencia), false)) then
    raise exception 'Solo el administrador de esa agencia puede registrar su pago.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.';
  end if;

  if not exists (select 1 from ketzal.profiles p
                  where p.id = p_embajador and p.type in ('embajador','agente')) then
    raise exception 'Esa persona no es embajador ni agente.';
  end if;

  -- Lo que se le debe HOY, del mismo corte que ve la pantalla.
  select coalesce((
    select sum((e->>'a_pagar')::numeric)
    from jsonb_array_elements(ketzal.corte_embajadores(p_fecha)->'filas') e
    where e->>'embajador_id' = p_embajador::text
      and (e->>'agencia_id') is not distinct from
          (case when p_agencia is null then null else p_agencia::text end)
  ), 0) into v_debido;

  if p_monto > v_debido + 0.005 then
    raise exception 'Se le deben % y estás registrando %. Revisa el corte.', v_debido, p_monto;
  end if;

  v_concepto := case when p_agencia is null
                     then 'Bono por reclutar embajador'
                     else 'Comisión de embajador' end;

  insert into ketzal.expenses(supplier_id, created_by, category, concept, amount_mxn,
                              method, spent_at, provider_profile_id)
  values (p_agencia, v_uid, 'embajador', v_concepto, round(p_monto, 2),
          coalesce(p_metodo, 'transferencia'), p_fecha, p_embajador)
  returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "ketzal"."pagar_corte_embajador"("p_embajador" "uuid", "p_agencia" "uuid", "p_monto" numeric, "p_fecha" "date", "p_metodo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."payables_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v jsonb; v_sup uuid := ketzal.my_supplier_id();
begin
  if v_sup is null then
    return jsonb_build_object('total_debo', 0, 'total_pagado', 0, 'total_saldo', 0, 'lista', '[]'::jsonb);
  end if;
  with ventas as (
    select b.owner_supplier_id as owner_id, b.total,
      round(b.total * coalesce((select commission_rate from ketzal.suppliers o where o.id = b.owner_supplier_id), 0) / 100.0, 2) as comision
    from ketzal.bookings b
    where b.selling_supplier_id = v_sup and b.owner_supplier_id <> b.selling_supplier_id and b.status in ('confirmed','paid')
  ),
  debo as (
    select owner_id, count(*) as num_ventas, sum(total) as vendido, sum(comision) as comision, sum(total - comision) as debo
    from ventas group by owner_id
  ),
  pagos as (
    select provider_supplier_id as owner_id, sum(case when kind = 'egreso' then amount_mxn else -amount_mxn end) as pagado
    from ketzal.expenses where supplier_id = v_sup and category = 'mayorista' and provider_supplier_id is not null
    group by provider_supplier_id
  ),
  merged as (
    select d.owner_id, (select name from ketzal.suppliers o where o.id = d.owner_id) as owner,
           d.num_ventas, d.vendido, d.comision, d.debo, coalesce(p.pagado, 0) as pagado, d.debo - coalesce(p.pagado, 0) as saldo
    from debo d left join pagos p on p.owner_id = d.owner_id
  )
  select jsonb_build_object(
    'total_debo', coalesce(sum(debo), 0), 'total_pagado', coalesce(sum(pagado), 0), 'total_saldo', coalesce(sum(saldo), 0),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'owner_id', owner_id, 'owner', owner, 'num_ventas', num_ventas, 'vendido', vendido,
      'comision', comision, 'debo', debo, 'pagado', pagado, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
  ) into v from merged;
  return v;
end $$;


ALTER FUNCTION "ketzal"."payables_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."platform_fee_for_payment"("p_booking" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_service uuid; v_num_pax int; v_total numeric; v_channel text;
  r record; v_com_total numeric;
begin
  select service_id, num_pax, total, channel
    into v_service, v_num_pax, v_total, v_channel
    from ketzal.bookings where id = p_booking;
  if not found then return 0; end if;
  if v_channel <> 'portal' or coalesce(v_total, 0) <= 0 then return 0; end if;

  select * into r from ketzal.resolve_commission_rule(v_service, 'plataforma', null);
  if r.basis is null then return 0; end if;

  v_com_total := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, v_num_pax, v_total);
  if v_com_total <= 0 then return 0; end if;

  return round(v_com_total * least(1, greatest(0, coalesce(p_amount, 0)) / v_total), 2);
end $$;


ALTER FUNCTION "ketzal"."platform_fee_for_payment"("p_booking" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."preview_cancellation"("p_booking" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
  v_tramo_pct := least(100, greatest(0,
                   coalesce(v_tramo_pct, (v_pol->>'no_show_pct')::numeric, 100)));

  if coalesce((v_pol->>'piso_enganche')::boolean, false) then
    select coalesce(sum(amount), 0) into v_eng
      from ketzal.payment_schedule
     where booking_id = p_booking and kind = 'enganche';
  end if;

  v_pena := least(v_b.total, greatest(round(v_b.total * v_tramo_pct / 100, 2), greatest(v_eng, 0)));
  v_vig := least(120, greatest(1, coalesce((v_pol->'credito'->>'vigencia_meses')::int, 12)));

  return jsonb_build_object(
    'dias_antes', v_days,
    'tramo_pct', v_tramo_pct,
    'pena_mxn', v_pena,
    'pagado_mxn', v_pagado,
    'efectivo', jsonb_build_object('a_devolver_mxn', greatest(0, v_pagado - v_pena)),
    'credito', jsonb_build_object(
      'monto_mxn', least(v_pagado, round(v_pagado * least(100, greatest(0,
                     coalesce((v_pol->'credito'->>'pct')::numeric, 100))) / 100, 2)),
      'expira', (current_date + make_interval(months => v_vig))::date),
    'es_snapshot', v_es_snapshot,
    'aceptada', v_b.policy_accepted_at is not null,
    'cancelada', v_b.status = 'cancelled');
end $$;


ALTER FUNCTION "ketzal"."preview_cancellation"("p_booking" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric DEFAULT 0.20) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'ketzal', 'public'
    AS $$ select ketzal._compute_payment_plan(p_total, current_date, p_final, p_frequency, p_down_pct); $$;


ALTER FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."puede_folear"("p_supplier" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(p_supplier is not null and (
       coalesce(auth.role(), '') = 'service_role'
    or coalesce(ketzal.is_superadmin(), false)
    or p_supplier = ketzal.my_supplier_id()
    or exists (select 1 from ketzal.bookings b
                where b.selling_supplier_id = p_supplier
                  and b.marketplace_customer_id = auth.uid())
  ), false);
$$;


ALTER FUNCTION "ketzal"."puede_folear"("p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."puede_operar_booking"("p_booking" "ketzal"."bookings") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(
    p_booking.marketplace_customer_id = auth.uid()
    or ketzal.is_superadmin()
    or (ketzal.is_active() and (
          p_booking.selling_supplier_id = ketzal.my_supplier_id()
       or p_booking.owner_supplier_id  = ketzal.my_supplier_id()
       or p_booking.sold_by = auth.uid())), false);
$$;


ALTER FUNCTION "ketzal"."puede_operar_booking"("p_booking" "ketzal"."bookings") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."puedo_escribir_imagen_supplier"("p_supplier" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce(ketzal.is_superadmin(), false)
      or coalesce((
           select ketzal.is_agency_admin(s.id)
               or (s.owner_supplier_id is not null and ketzal.is_agency_admin(s.owner_supplier_id))
             from ketzal.suppliers s
            where s.id::text = p_supplier
         ), false);
$$;


ALTER FUNCTION "ketzal"."puedo_escribir_imagen_supplier"("p_supplier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."puedo_subir_comprobante"("p_booking" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
  select coalesce((
    select b.marketplace_customer_id = auth.uid() and b.channel = 'portal'
      from ketzal.bookings b
     where b.id = p_booking and b.status <> 'cancelled'
  ), false);
$$;


ALTER FUNCTION "ketzal"."puedo_subir_comprobante"("p_booking" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."redeem_credit"("p_credit" "uuid", "p_booking" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_c ketzal.credits;
  v_b ketzal.bookings;
  v_titular uuid;
  v_persona_venta uuid;
  v_canjeado numeric; v_saldo_credito numeric; v_pagado numeric; v_saldo_venta numeric; v_balance numeric;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_c from ketzal.credits where id = p_credit;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if current_date >= v_c.expires_at then
    raise exception 'El crédito expiró el %.', v_c.expires_at; end if;

  select marketplace_customer_id into v_titular from ketzal.customers where id = v_c.customer_id;

  -- Legitimación del lado del CRÉDITO: superadmin, la agencia EMISORA, o el
  -- propio titular (el viajero aplicándolo desde su cuenta). Sin esto, la
  -- agencia destino podía consumir sola el crédito emitido por otra.
  if not (ketzal.is_superadmin()
          or coalesce(v_c.supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_titular = v_uid, false)) then
    raise exception 'Solo el titular del crédito o la agencia que lo emitió pueden aplicarlo.';
  end if;

  select * into v_b from ketzal.bookings where id = p_booking for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_b.marketplace_customer_id = v_uid, false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta está cancelada.'; end if;

  -- Misma PERSONA: mismo customer, o identidad marketplace compartida.
  if v_b.customer_id is distinct from v_c.customer_id then
    select marketplace_customer_id into v_persona_venta from ketzal.customers where id = v_b.customer_id;
    if v_titular is null or v_persona_venta is null
       or v_titular is distinct from v_persona_venta then
      raise exception 'El crédito es de otro cliente.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_credit::text, 42));
  select coalesce(sum(amount_mxn), 0) into v_canjeado
    from ketzal.payments where credit_id = p_credit and status = 'COMPLETED';
  v_saldo_credito := round(v_c.amount_mxn - v_canjeado, 2);
  if v_monto > v_saldo_credito then
    raise exception 'El monto (%) excede el saldo del crédito (%).', v_monto, v_saldo_credito;
  end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = p_booking and status = 'COMPLETED';
  v_saldo_venta := round(v_b.total - v_pagado, 2);
  if v_monto > v_saldo_venta then
    raise exception 'El monto (%) excede el saldo de la venta (%).', v_monto, v_saldo_venta;
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, credit_id)
  values (p_booking, v_b.selling_supplier_id, v_uid, v_monto, 'COMPLETED', 'payment',
          'credito', now(), 1, 1, p_credit);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = p_booking and status <> 'cancelled';

  return round(v_saldo_credito - v_monto, 2);
end $$;


ALTER FUNCTION "ketzal"."redeem_credit"("p_credit" "uuid", "p_booking" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."refund_payment"("p_payment_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_pay ketzal.payments;
  v_supplier uuid; v_total numeric; v_pagado numeric; v_balance numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;

  select * into v_pay from ketzal.payments where id = p_payment_id;  -- RLS: solo tus ventas
  if not found then raise exception 'Pago no encontrado o sin acceso'; end if;
  if v_pay.type <> 'payment' or v_pay.status <> 'COMPLETED' then
    raise exception 'Ese movimiento no es un pago reembolsable.'; end if;
  if v_pay.payment_method = 'credito' then
    raise exception 'Un abono pagado con crédito no se devuelve en efectivo.'; end if;

  if exists (select 1 from ketzal.payments r where r.refunds_payment_id = p_payment_id) then
    raise exception 'Este pago ya fue reembolsado.'; end if;

  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = v_pay.booking_id for update;

  select coalesce(sum(case when type='payment' then amount_mxn
                           when type='refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = v_pay.booking_id and status = 'COMPLETED';
  if round(v_pay.amount_mxn, 2) > round(v_pagado, 2) then
    raise exception 'El reembolso (%) excede lo pagado (%).', v_pay.amount_mxn, round(v_pagado, 2);
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, refunds_payment_id)
  values (v_pay.booking_id, v_supplier, v_uid, v_pay.amount_mxn, 'COMPLETED', 'refund',
          v_pay.payment_method, now(), 1, 1, p_payment_id);

  select balance into v_balance from ketzal.bookings_with_balance where id = v_pay.booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status else status end
   where id = v_pay.booking_id and status <> 'cancelled';

  return v_pay.amount_mxn;
end $$;


ALTER FUNCTION "ketzal"."refund_payment"("p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."refund_payment_partial"("p_payment_id" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_pay ketzal.payments;
  v_supplier uuid; v_total numeric; v_pagado numeric; v_balance numeric;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_pay from ketzal.payments where id = p_payment_id;  -- RLS: solo tus ventas
  if not found then raise exception 'Pago no encontrado o sin acceso'; end if;
  if v_pay.type <> 'payment' or v_pay.status <> 'COMPLETED' then
    raise exception 'Ese movimiento no es un pago reembolsable.'; end if;
  if v_pay.payment_method = 'credito' then
    raise exception 'Un abono pagado con crédito no se devuelve en efectivo.'; end if;
  if v_monto > round(v_pay.amount_mxn, 2) then
    raise exception 'El reembolso (%) excede el pago (%).', v_monto, round(v_pay.amount_mxn, 2);
  end if;

  if exists (select 1 from ketzal.payments r where r.refunds_payment_id = p_payment_id) then
    raise exception 'Este pago ya tiene una devolución ligada.'; end if;

  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = v_pay.booking_id for update;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = v_pay.booking_id and status = 'COMPLETED';
  if v_monto > round(v_pagado, 2) then
    raise exception 'El reembolso (%) excede lo pagado (%).', v_monto, round(v_pagado, 2);
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, refunds_payment_id)
  values (v_pay.booking_id, v_supplier, v_uid, v_monto, 'COMPLETED', 'refund',
          v_pay.payment_method, now(), 1, 1, p_payment_id);

  select balance into v_balance from ketzal.bookings_with_balance where id = v_pay.booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = v_pay.booking_id and status <> 'cancelled';

  return v_monto;
end $$;


ALTER FUNCTION "ketzal"."refund_payment_partial"("p_payment_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


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
                       when status = 'paid' then 'reserved'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = p_booking_id and status <> 'cancelled';
  return v_balance;
end $$;


ALTER FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."register_traveler"("p_full_name" "text", "p_phone" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into ketzal.profiles (id, email, name, phone, type, active)
  values (v_uid, v_email, nullif(btrim(p_full_name),''), nullif(btrim(p_phone),''), 'viajero', true)
  on conflict (id) do update
    set name  = excluded.name,
        phone = excluded.phone,
        active = true
    where ketzal.profiles.type = 'viajero';
end $$;


ALTER FUNCTION "ketzal"."register_traveler"("p_full_name" "text", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."release_seat"("p_passenger_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_booking_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select bp.booking_id into v_booking_id
  from ketzal.booking_passengers bp where bp.id = p_passenger_id;
  if not found then raise exception 'Pasajero no encontrado'; end if;
  select * into v_b from ketzal.bookings where id = v_booking_id;
  if not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pasajero no encontrado o sin acceso';
  end if;

  delete from ketzal.seat_assignments where passenger_id = p_passenger_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'released', v_n > 0);
end $$;


ALTER FUNCTION "ketzal"."release_seat"("p_passenger_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."remove_my_passenger"("p_passenger_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  delete from ketzal.booking_passengers bp
  using ketzal.bookings b
  where bp.id = p_passenger_id
    and b.id = bp.booking_id
    and b.marketplace_customer_id = v_uid
    and b.status <> 'cancelled';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Pasajero no encontrado o sin acceso'; end if;
  return jsonb_build_object('ok', true);
end $$;


ALTER FUNCTION "ketzal"."remove_my_passenger"("p_passenger_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."reopen_spei_payment"("p_intent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_intent ketzal.payment_intents;
  v_bstatus ketzal.booking_status;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found or v_intent.provider <> 'spei' or v_intent.status <> 'rejected' then
    raise exception 'Transferencia no encontrada o no está rechazada.';
  end if;

  if not ketzal.is_superadmin() and not ketzal.is_agency_admin(v_intent.supplier_id) then
    raise exception 'Solo el admin de la agencia puede reabrir esta transferencia.';
  end if;

  select status into v_bstatus from ketzal.bookings where id = v_intent.booking_id;
  if v_bstatus = 'cancelled' then
    raise exception 'La venta está cancelada; registra el dinero como abono manual si aplica.';
  end if;

  if exists (
    select 1 from ketzal.payment_intents
    where booking_id = v_intent.booking_id and provider = 'spei' and status = 'pending'
  ) then
    raise exception 'Esa venta ya tiene otra transferencia pendiente; resuélvela primero.';
  end if;

  update ketzal.payment_intents set status = 'pending', updated_at = now()
    where id = p_intent_id;

  return jsonb_build_object('ok', true);
end $$;


ALTER FUNCTION "ketzal"."reopen_spei_payment"("p_intent_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."request_join_agency"("p_supplier" "uuid", "p_mensaje" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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


ALTER FUNCTION "ketzal"."request_join_agency"("p_supplier" "uuid", "p_mensaje" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."resolve_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_supplier" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("basis" "text", "rate" numeric, "unit_amount" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_platform numeric;
begin
  if p_payee_type = 'embajador' then
    return query
      select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
       where r.active and r.payee_type = 'embajador'
         and r.scope_profile_id is not null and r.scope_profile_id = p_scope
         and r.service_id = p_service
       limit 1;
    if found then return; end if;
    return query
      select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
       where r.active and r.payee_type = 'embajador'
         and r.scope_profile_id is not null and r.scope_profile_id = p_scope
         and r.service_id is null
       limit 1;
    if found then return; end if;
    if p_supplier is not null then
      return query
        select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
         where r.active and r.payee_type = 'embajador'
           and r.scope_supplier_id = p_supplier and r.service_id = p_service
         limit 1;
      if found then return; end if;
      return query
        select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
         where r.active and r.payee_type = 'embajador'
           and r.scope_supplier_id = p_supplier and r.service_id is null
         limit 1;
    end if;
    return;
  end if;

  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type = 'agente' then r.scope_profile_id else r.scope_supplier_id end)
          is not distinct from p_scope
      and r.service_id = p_service
    limit 1;
  if found then return; end if;
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type = 'agente' then r.scope_profile_id else r.scope_supplier_id end)
          is not distinct from p_scope
      and r.service_id is null
    limit 1;
  if found then return; end if;
  if p_payee_type = 'plataforma' then
    select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
    return query select 'percent'::text, coalesce(v_platform,0)::numeric, null::numeric;
  elsif p_payee_type = 'agencia' then
    return query select 'percent'::text,
      coalesce((select commission_rate from ketzal.suppliers s where s.id = p_scope),0)::numeric,
      null::numeric;
  end if;
end $$;


ALTER FUNCTION "ketzal"."resolve_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_supplier" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."resolve_join_request"("p_id" "uuid", "p_approve" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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


ALTER FUNCTION "ketzal"."resolve_join_request"("p_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."resolve_spei_payment"("p_intent_id" "uuid", "p_approve" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_intent ketzal.payment_intents;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found or v_intent.provider <> 'spei' or v_intent.status <> 'pending' then
    raise exception 'Transferencia no encontrada o ya resuelta.';
  end if;

  if not ketzal.is_superadmin() and not ketzal.is_agency_admin(v_intent.supplier_id) then
    raise exception 'Solo el admin de la agencia puede resolver esta transferencia.';
  end if;

  if not p_approve then
    update ketzal.payment_intents set status = 'rejected', updated_at = now()
      where id = p_intent_id;
    return jsonb_build_object('ok', true, 'rejected', true);
  end if;

  return ketzal.confirm_online_payment(
    p_intent_id, coalesce(v_intent.mp_payment_id, 'spei-directo'), 'approved', 'transferencia');
end $$;


ALTER FUNCTION "ketzal"."resolve_spei_payment"("p_intent_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."reverse_expense"("p_expense_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); r ketzal.expenses; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  select * into r from ketzal.expenses where id = p_expense_id;
  if r.id is null then raise exception 'Gasto no encontrado o sin acceso'; end if;
  if r.kind = 'reverso' then raise exception 'No puedes revertir un reverso'; end if;
  if exists (select 1 from ketzal.expenses e where e.reverses_expense_id = p_expense_id) then
    raise exception 'Este gasto ya tiene un reverso'; end if;
  insert into ketzal.expenses(supplier_id, created_by, kind, reverses_expense_id, concept, category,
    amount_mxn, method, spent_at, provider_supplier_id, provider_profile_id, booking_id, notes)
  values (r.supplier_id, v_uid, 'reverso', p_expense_id,
    'Reverso: ' || r.concept || ' (' || coalesce(nullif(trim(p_reason),''), 'sin motivo') || ')',
    r.category, r.amount_mxn, r.method, current_date, r.provider_supplier_id, r.provider_profile_id, r.booking_id, r.notes)
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "ketzal"."reverse_expense"("p_expense_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."revoke_invitation"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare v_sup uuid;
begin
  select supplier_id into v_sup from ketzal.agency_invitations where id = p_id and status = 'pending';
  if v_sup is null then raise exception 'Invitación no encontrada.'; end if;
  if not (ketzal.is_superadmin() or ketzal.is_agency_admin(v_sup)) then
    raise exception 'No puedes revocar invitaciones de otra agencia.';
  end if;
  update ketzal.agency_invitations set status = 'revoked' where id = p_id;
end $$;


ALTER FUNCTION "ketzal"."revoke_invitation"("p_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."seat_map_for_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings; v_tipo text; v_total int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_b from ketzal.bookings where id = p_booking_id;
  if not found or not ketzal.puede_operar_booking(v_b) then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;

  select s.transport_type into v_tipo from ketzal.services s where s.id = v_b.service_id;
  if v_tipo is null or v_b.travel_date is null then
    return jsonb_build_object('enabled', false);
  end if;
  select d.max_capacity into v_total
  from ketzal.service_departures d
  where d.service_id = v_b.service_id and d.departs_on = v_b.travel_date;
  if v_total is null then return jsonb_build_object('enabled', false); end if;

  return jsonb_build_object(
    'enabled', true,
    'transport_type', v_tipo,
    'total', v_total,
    'occupied', coalesce((
      select jsonb_agg(sa.seat_number)
      from ketzal.seat_assignments sa
      join ketzal.bookings b on b.id = sa.booking_id
      where sa.service_id = v_b.service_id and sa.travel_date = v_b.travel_date
        and b.status <> 'cancelled'
    ), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('passenger_id', sa.passenger_id, 'seat', sa.seat_number))
      from ketzal.seat_assignments sa where sa.booking_id = v_b.id
    ), '[]'::jsonb)
  );
end $$;


ALTER FUNCTION "ketzal"."seat_map_for_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_agency_member_role"("p_user" "uuid", "p_role" "ketzal"."user_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
  -- b058: un miembro de agencia opera el back-office, cualquiera de los dos roles.
  update ketzal.profiles
     set type = 'agente', updated_at = now()
   where id = p_user and (type is null or type = 'viajero');
end $$;


ALTER FUNCTION "ketzal"."set_agency_member_role"("p_user" "uuid", "p_role" "ketzal"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_booking_ambassador"("p_booking" "uuid", "p_ambassador" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); b ketzal.bookings;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then raise exception 'Venta no encontrada'; end if;
  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    raise exception 'Sin permiso sobre esta venta';
  end if;
  if not exists (select 1 from ketzal.profiles s where s.id = p_ambassador and s.type = 'embajador') then
    raise exception 'Embajador no valido';
  end if;
  if (b.sold_by is not null and b.sold_by = p_ambassador)
     or (b.marketplace_customer_id is not null and b.marketplace_customer_id = p_ambassador) then
    raise exception 'Esa persona es quien compra o quien vendio: no puede referirse a si misma';
  end if;

  update ketzal.bookings set ambassador_id = p_ambassador
   where id = p_booking and ambassador_id is null;
  return p_ambassador;
end $$;


ALTER FUNCTION "ketzal"."set_booking_ambassador"("p_booking" "uuid", "p_ambassador" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_booking_currency"("p_booking_id" "uuid", "p_currency" "text", "p_rate" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_paid numeric;
begin
  if p_currency not in ('MXN','USD') then
    raise exception 'Divisa no válida (solo MXN o USD).';
  end if;
  if p_currency = 'USD' and (p_rate is null or p_rate <= 0) then
    raise exception 'El tipo de cambio debe ser mayor que cero.';
  end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund'  then -amount_mxn else 0 end), 0)
    into v_paid
    from ketzal.payments where booking_id = p_booking_id and status = 'COMPLETED';
  if v_paid <> 0 then
    raise exception 'No se puede cambiar la divisa: la venta ya tiene abonos.';
  end if;

  update ketzal.bookings
     set currency = p_currency,
         exchange_rate = case when p_currency = 'USD' then round(p_rate, 4) else null end
   where id = p_booking_id;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
end $$;


ALTER FUNCTION "ketzal"."set_booking_currency"("p_booking_id" "uuid", "p_currency" "text", "p_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_basis" "text", "p_rate" numeric, "p_unit" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_id uuid; v_scope_sup uuid; v_scope_prof uuid;
        v_es_agencia boolean := false;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_payee_type not in ('plataforma','agencia','embajador','agente') then raise exception 'payee_type invalido'; end if;
  if p_payee_type = 'plataforma' and p_scope is not null then raise exception 'plataforma no lleva scope'; end if;
  if p_payee_type in ('agencia','embajador','agente') and p_scope is null then raise exception 'esta regla requiere scope'; end if;

  -- b080: la tarifa de EMBAJADOR puede ser de una AGENCIA (la general que esa
  -- agencia paga a quien le traiga viajeros, m008/ADR-0021) o de una PERSONA
  -- (el trato especial que gana sobre todas). Se distingue por lo que sea el
  -- scope: un uuid no puede ser agencia y embajador a la vez.
  if p_payee_type = 'embajador' then
    if exists (select 1 from ketzal.suppliers s
                where s.id = p_scope and s.supplier_type = 'agency') then
      v_es_agencia := true;
    elsif not exists (select 1 from ketzal.profiles p
                       where p.id = p_scope and p.type = 'embajador') then
      raise exception 'El scope de una tarifa de embajador debe ser una agencia o un embajador';
    end if;
  end if;

  if not (
    ketzal.is_superadmin()
    or (p_payee_type = 'agencia' and ketzal.is_active()
        and p_scope is not null and p_scope = ketzal.my_supplier_id())
    -- b080: el admin fija la tarifa de embajadores DE SU AGENCIA. Sin esto, cada
    -- agencia dependia del fundador para poder pagarle a quien le trae ventas,
    -- que es justo lo que m005/m008 quisieron quitar de en medio.
    or (p_payee_type = 'embajador' and v_es_agencia and ketzal.is_active()
        and coalesce(ketzal.is_agency_admin(p_scope), false))
    or (p_payee_type = 'agente' and ketzal.is_active()
        and p_scope is not null
        and exists (
          select 1 from ketzal.profiles me
          join ketzal.profiles target on target.id = p_scope
          where me.id = v_uid and me.role = 'admin' and me.supplier_id is not null
            and me.supplier_id = target.supplier_id
        ))
  ) then
    raise exception 'Sin permiso para esta regla';
  end if;

  if p_payee_type = 'agente'
     and not exists (select 1 from ketzal.profiles p where p.id = p_scope and p.type = 'agente') then
    raise exception 'Agente no valido'; end if;

  v_scope_sup  := case
                    when p_payee_type = 'embajador' and v_es_agencia then p_scope
                    when p_payee_type in ('embajador','agente') then null
                    else p_scope end;
  v_scope_prof := case
                    when p_payee_type = 'embajador' and v_es_agencia then null
                    when p_payee_type in ('embajador','agente') then p_scope
                    else null end;

  update ketzal.commission_rules set active = false
   where active and payee_type = p_payee_type
     and scope_supplier_id is not distinct from v_scope_sup
     and scope_profile_id  is not distinct from v_scope_prof
     and service_id is not distinct from p_service;

  if p_basis is null then return null; end if;

  if p_basis = 'percent' then
    if p_rate is null or p_rate < 0 or p_rate > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, scope_profile_id, basis, rate)
      values (p_service, p_payee_type, v_scope_sup, v_scope_prof, 'percent', round(p_rate,2)) returning id into v_id;
  elsif p_basis in ('fijo_venta','fijo_pax') then
    if p_unit is null or p_unit <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, scope_profile_id, basis, unit_amount)
      values (p_service, p_payee_type, v_scope_sup, v_scope_prof, p_basis, round(p_unit,2)) returning id into v_id;
  elsif p_basis = 'hibrido' then
    if p_rate is null or p_rate < 0 or p_rate > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
    if p_unit is null or p_unit < 0 then raise exception 'El monto por pasajero debe ser mayor o igual a cero'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, scope_profile_id, basis, rate, unit_amount)
      values (p_service, p_payee_type, v_scope_sup, v_scope_prof, 'hibrido', round(p_rate,2), round(p_unit,2)) returning id into v_id;
  else
    raise exception 'basis invalido';
  end if;
  return v_id;
end $$;


ALTER FUNCTION "ketzal"."set_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_basis" "text", "p_rate" numeric, "p_unit" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."set_referral_code"("p_profile" "uuid", "p_code" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $_$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_profile is null then raise exception 'Falta el perfil'; end if;

  if not (
    ketzal.is_superadmin()
    or (ketzal.is_active() and exists (
          select 1 from ketzal.profiles me
          join ketzal.profiles target on target.id = p_profile
          where me.id = v_uid and me.role = 'admin' and me.supplier_id is not null
            and me.supplier_id = target.supplier_id))
  ) then
    raise exception 'Sin permiso para asignar el código de este perfil';
  end if;

  if not exists (select 1 from ketzal.profiles p
                  where p.id = p_profile and p.type in ('embajador','agente')) then
    raise exception 'Solo un agente o un embajador puede tener código de referido';
  end if;

  v_code := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '');
  if v_code is not null and v_code !~ '^[A-Z0-9_-]{3,32}$' then
    raise exception 'El código debe tener 3–32 caracteres: letras, números, guion o guion bajo';
  end if;

  begin
    update ketzal.profiles set referral_code = v_code where id = p_profile;
  exception when unique_violation then
    raise exception 'Ese código ya está en uso por otra persona';
  end;
  return v_code;
end $_$;


ALTER FUNCTION "ketzal"."set_referral_code"("p_profile" "uuid", "p_code" "text") OWNER TO "postgres";


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
  -- b058: admin/superadmin operan el back-office; con type='viajero' el gate de
  -- persona los expulsaría a /mis-compras.
  if p_role in ('admin','superadmin') then
    update ketzal.profiles
       set type = 'agente', updated_at = now()
     where id = p_user and (type is null or type = 'viajero');
  end if;
end $$;


ALTER FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."settle_ledger"("p_account_type" "text", "p_supplier" "uuid" DEFAULT NULL::"uuid", "p_profile" "uuid" DEFAULT NULL::"uuid", "p_amount" numeric DEFAULT NULL::numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_saldo numeric; v_amount numeric;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_superadmin() then raise exception 'Solo el superadmin liquida cuentas.'; end if;
  if p_account_type = 'viajero' then
    raise exception 'El credito de un viajero es redimible en Ketzal, no retirable: no se liquida en efectivo. Si hay que devolver dinero, va por la devolucion del pago original.';
  end if;
  if p_account_type in ('embajador','agente') then
    raise exception 'A % se le paga registrando el gasto en /gastos (categoria %), no liquidando aqui: el gasto ya espeja su liquidacion al ledger. Liquidar por los dos lados paga dos veces.', p_account_type, p_account_type;
  end if;
  if p_account_type <> 'agencia' then raise exception 'Cuenta invalida.'; end if;

  select coalesce(sum(amount_mxn), 0) into v_saldo
  from ketzal.ledger_entries
  where account_type = p_account_type
    and (account_supplier_id = p_supplier or account_supplier_id is null and p_supplier is null)
    and (account_profile_id = p_profile or account_profile_id is null and p_profile is null);

  v_amount := round(coalesce(p_amount, abs(v_saldo)), 2);
  if v_amount <= 0 then raise exception 'Nada que liquidar (saldo %).', v_saldo; end if;
  if v_amount > abs(v_saldo) + 0.005 then
    raise exception 'El monto (%) excede el saldo (%).', v_amount, v_saldo;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object('account_type', p_account_type,
      'account_supplier_id', p_supplier, 'account_profile_id', p_profile,
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then -v_amount else v_amount end,
      'note', coalesce(p_note, 'Liquidacion')),
    jsonb_build_object('account_type', 'plataforma',
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then v_amount else -v_amount end,
      'note', coalesce(p_note, 'Liquidacion'))
  ));
  return jsonb_build_object('ok', true, 'liquidado', v_amount, 'saldo_previo', v_saldo);
end $$;


ALTER FUNCTION "ketzal"."settle_ledger"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_amount" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."snapshot_booking_policy"("p_booking" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."snapshot_booking_policy"("p_booking" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text" DEFAULT NULL::"text", "p_contact" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_poll ketzal.polls;
  v_month date;
  v_id uuid;
begin
  if p_poll is null or p_option is null or p_month is null or p_voter_hash is null then
    return null;
  end if;
  if char_length(p_voter_hash) not between 16 and 128 then return null; end if;

  if p_meta is not null and pg_column_size(p_meta) > 4096 then
    raise exception 'Meta demasiado grande';
  end if;
  if char_length(coalesce(p_suggestion, '')) > 280 then
    raise exception 'Sugerencia demasiado larga';
  end if;
  if char_length(coalesce(p_contact, '')) > 120 then
    raise exception 'Contacto demasiado largo';
  end if;

  select * into v_poll from ketzal.polls
   where id = p_poll
     and status = 'open'
     and (closes_at is null or closes_at >= current_date);
  if not found then return null; end if;

  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o
     where (o->>'id')::int = p_option
  ) then
    return null;
  end if;

  v_month := date_trunc('month', p_month)::date;
  if v_month < date_trunc('month', v_poll.month_from)::date
     or v_month > date_trunc('month', v_poll.month_to)::date then
    return null;
  end if;

  insert into ketzal.poll_votes
    (poll_id, option_id, preferred_month, suggestion, contact, voter_hash, meta)
  values
    (p_poll, p_option, v_month, nullif(btrim(p_suggestion), ''),
     nullif(btrim(p_contact), ''), p_voter_hash, p_meta)
  on conflict (poll_id, voter_hash) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'ya_votaste', v_id is null);
end $$;


ALTER FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text", "p_contact" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."submit_rating"("p_booking_id" "uuid", "p_kind" "text", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_b ketzal.bookings; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'La calificación debe ser de 1 a 5.'; end if;
  if p_kind not in ('traveler_to_provider','traveler_to_app','provider_to_traveler') then
    raise exception 'Tipo de calificación inválido.'; end if;

  select * into v_b from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Reserva no encontrada.'; end if;

  if not (v_b.status = 'paid' and (v_b.travel_date is null or v_b.travel_date <= current_date)) then
    raise exception 'Solo puedes calificar después de un viaje completado y pagado.';
  end if;

  if p_kind in ('traveler_to_provider','traveler_to_app') then
    if v_b.marketplace_customer_id is distinct from v_uid then
      raise exception 'Solo el viajero de este pedido puede dejar esta calificación.';
    end if;
  else -- provider_to_traveler: null-safe en cada rama (fail-closed)
    if v_b.marketplace_customer_id is null then
      raise exception 'Esta reserva no es de un viajero de marketplace.'; end if;
    if not (
         ketzal.is_superadmin()
         or (v_b.sold_by is not null and v_b.sold_by = v_uid)
         or (v_b.selling_supplier_id is not null
             and ketzal.my_supplier_id() is not null
             and v_b.selling_supplier_id = ketzal.my_supplier_id())
       ) then
      raise exception 'Solo la agencia vendedora puede calificar al viajero.';
    end if;
  end if;

  insert into ketzal.ratings(booking_id, kind, author_id, rating, comment)
  values (p_booking_id, p_kind, v_uid, p_rating, nullif(btrim(coalesce(p_comment,'')),''))
  on conflict (booking_id, kind, author_id)
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "ketzal"."submit_rating"("p_booking_id" "uuid", "p_kind" "text", "p_rating" integer, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."submit_spei_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_reference" "text" DEFAULT NULL::"text", "p_receipt_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_mc uuid; v_bstatus ketzal.booking_status;
  v_balance numeric; v_amount numeric(12,2);
  v_ref text; v_receipt text; v_id uuid;
  v_channel text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  v_receipt := nullif(left(btrim(coalesce(p_receipt_url,'')), 500), '');
  if v_receipt is null then
    raise exception 'Adjunta el comprobante de tu transferencia.';
  end if;

  select selling_supplier_id, marketplace_customer_id, status, channel
    into v_supplier, v_mc, v_bstatus, v_channel
    from ketzal.bookings where id = p_booking_id;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  -- b091: la cobranza de una venta del back-office la lleva el agente.
  if v_channel <> 'portal' then
    raise exception 'Este viaje lo lleva tu agencia: los pagos van con ella.';
  end if;
  if v_bstatus = 'cancelled' then raise exception 'Este pedido está cancelado.'; end if;

  if not exists (
    select 1 from ketzal.suppliers s
    where s.id = v_supplier and coalesce(s.info->>'spei_clabe','') <> ''
  ) then
    raise exception 'Esta agencia no acepta transferencia directa.';
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then raise exception 'Monto inválido.'; end if;
  if v_amount > round(coalesce(v_balance, 0), 2) then
    raise exception 'El monto (%) excede el saldo pendiente (%).', v_amount, round(coalesce(v_balance,0),2);
  end if;

  v_ref := nullif(left(btrim(coalesce(p_reference,'')), 64), '');

  select id into v_id from ketzal.payment_intents
    where booking_id = p_booking_id and provider = 'spei' and status = 'pending'
    limit 1;
  if v_id is not null then
    update ketzal.payment_intents
      set amount = v_amount, mp_payment_id = v_ref, receipt_url = v_receipt, updated_at = now()
      where id = v_id;
  else
    insert into ketzal.payment_intents(booking_id, supplier_id, created_by, marketplace_customer_id,
                                       amount, provider, mp_payment_id, receipt_url, status)
    values (p_booking_id, v_supplier, null, v_uid, v_amount, 'spei', v_ref, v_receipt, 'pending')
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $$;


ALTER FUNCTION "ketzal"."submit_spei_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_reference" "text", "p_receipt_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_bitacora_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception
    'bitácora append-only: % sobre % está prohibido. Un evento equivocado se corrige con otro evento.',
    tg_op, tg_table_name
    using errcode = 'P0001';
end $$;


ALTER FUNCTION "ketzal"."tg_bitacora_inmutable"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."tg_commission_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare r record; v_amt numeric(12,2); v_sum numeric(12,2); v_code text;
begin
  if NEW.status not in ('reserved','confirmed','paid') then return NEW; end if;

  if NEW.channel = 'portal'
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

  if NEW.sold_by is not null
     and NEW.selling_supplier_id is not null
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='agente' and l.kind='devengo') then
    select * into r from ketzal.resolve_commission_rule(NEW.service_id, 'agente', NEW.sold_by);
    if r.basis is not null then
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt > 0 then
        insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate, unit_amount, num_pax, amount_mxn)
        values (NEW.id, 'agente', NEW.sold_by, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
      end if;
    end if;
  end if;

  if NEW.ambassador_id is not null
     and not exists (select 1 from ketzal.commission_lines l
                     where l.booking_id = NEW.id and l.payee_type='embajador' and l.kind='devengo') then
    select coalesce(referral_code, '(sin codigo)') into v_code
      from ketzal.profiles where id = NEW.ambassador_id;

    select * into r from ketzal.resolve_commission_rule(
      NEW.service_id, 'embajador', NEW.ambassador_id, NEW.selling_supplier_id);

    if r.basis is null then
      insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
      select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'sin_tarifa_de_la_agencia'
       where not exists (select 1 from ketzal.referral_misses m
                          where m.booking_id = NEW.id and m.reason = 'sin_tarifa_de_la_agencia');
    else
      v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, NEW.num_pax, NEW.total);
      if v_amt <= 0 then
        insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
        select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'tarifa_da_cero'
         where not exists (select 1 from ketzal.referral_misses m
                            where m.booking_id = NEW.id and m.reason = 'tarifa_da_cero');
      else
        select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
          into v_sum from ketzal.commission_lines where booking_id = NEW.id;
        if v_sum + v_amt > NEW.total then
          insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
          select NEW.id, v_code, NEW.ambassador_id, NEW.selling_supplier_id, 'comisiones_exceden_la_venta'
           where not exists (select 1 from ketzal.referral_misses m
                              where m.booking_id = NEW.id and m.reason = 'comisiones_exceden_la_venta');
        else
          insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate,
                                              unit_amount, num_pax, amount_mxn)
          values (NEW.id, 'embajador', NEW.ambassador_id, r.basis, r.rate, r.unit_amount, NEW.num_pax, v_amt);
        end if;
      end if;
    end if;
  end if;

  return NEW;
end $$;


ALTER FUNCTION "ketzal"."tg_commission_snapshot"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "ketzal"."tg_ledger_mirror_commission"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
    when 'embajador'  then jsonb_build_object('account_type','embajador','account_profile_id', new.payee_profile_id)
    when 'agente'     then jsonb_build_object('account_type','agente','account_profile_id', new.payee_profile_id)
  end;
  -- payee_type ya está acotado por el CHECK de la tabla a estos 4 valores;
  -- si algún día se agrega uno nuevo sin actualizar este CASE, v_payee sale
  -- null y ledger_post revienta al construir el jsonb (falla ruidoso, no silencioso).

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
end $$;


ALTER FUNCTION "ketzal"."tg_ledger_mirror_commission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_ledger_mirror_credit_issue"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_titular uuid;
begin
  if new.amount_mxn = 0 then return new; end if;

  -- La cuenta del viajero se nombra con su perfil. Un cliente dado de alta por
  -- un agente puede no tener identidad de plataforma: en ese caso NO se espeja
  -- (el crédito sigue válido y usable; sólo no aparece en /cuentas). Se avisa
  -- por WARNING en vez de inventar una cuenta o romper la cancelación.
  select marketplace_customer_id into v_titular
    from ketzal.customers where id = new.customer_id;
  if v_titular is null then
    raise warning 'ledger: crédito % sin titular de plataforma; no se espeja', new.id;
    return new;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type','viajero', 'account_profile_id', v_titular,
      'kind','credito_emitido', 'amount_mxn', new.amount_mxn,
      'booking_id', new.booking_origen_id,
      'note','Crédito por cancelación'),
    jsonb_build_object(
      'account_type','agencia', 'account_supplier_id', new.supplier_id,
      'kind','credito_emitido', 'amount_mxn', -1 * new.amount_mxn,
      'booking_id', new.booking_origen_id,
      'note','Crédito emitido a viajero (a cargo)')
  ));
  return new;
end $$;


ALTER FUNCTION "ketzal"."tg_ledger_mirror_credit_issue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_ledger_mirror_credit_redeem"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
declare
  v_titular uuid;
  v_vendedora uuid;
begin
  if new.amount_mxn = 0 then return new; end if;

  select c.marketplace_customer_id, b.selling_supplier_id
    into v_titular, v_vendedora
    from ketzal.bookings b
    left join ketzal.customers c on c.id = b.customer_id
   where b.id = new.booking_id;

  -- Sin titular o sin agencia vendedora (agente libre) no hay par que cuadre.
  if v_titular is null or v_vendedora is null then
    raise warning 'ledger: canje de crédito en pago % sin titular o sin agencia vendedora; no se espeja', new.id;
    return new;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type','viajero', 'account_profile_id', v_titular,
      'kind','credito_canjeado', 'amount_mxn', -1 * new.amount_mxn,
      'booking_id', new.booking_id, 'payment_id', new.id,
      'note','Crédito aplicado a una compra'),
    jsonb_build_object(
      'account_type','agencia', 'account_supplier_id', v_vendedora,
      'kind','credito_canjeado', 'amount_mxn', new.amount_mxn,
      'booking_id', new.booking_id, 'payment_id', new.id,
      'note','Crédito recibido como pago')
  ));
  return new;
end $$;


ALTER FUNCTION "ketzal"."tg_ledger_mirror_credit_redeem"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_ledger_mirror_expense"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_signo numeric;
begin
  if new.category not in ('embajador','agente') then return new; end if;
  if new.provider_profile_id is null or new.supplier_id is null or new.amount_mxn = 0 then
    return new;
  end if;

  -- 'egreso' baja lo que se le debe a la persona; 'reverso' lo devuelve.
  v_signo := case when new.kind = 'reverso' then 1 else -1 end;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type', new.category,
      'account_profile_id', new.provider_profile_id,
      'kind', 'liquidacion',
      'amount_mxn', v_signo * new.amount_mxn,
      'note', 'Pago de comision ' || new.category),
    jsonb_build_object(
      'account_type', 'agencia',
      'account_supplier_id', new.supplier_id,
      'kind', 'liquidacion',
      'amount_mxn', -v_signo * new.amount_mxn,
      'note', 'Pago de comision ' || new.category || ' (a cargo)')
  ));
  return new;
end $$;


ALTER FUNCTION "ketzal"."tg_ledger_mirror_expense"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_polls_congelar_opciones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  if old.status <> 'draft' then
    if new.options is distinct from old.options then
      raise exception 'No se pueden cambiar los destinos de una encuesta publicada';
    end if;
    if new.month_from is distinct from old.month_from
       or new.month_to is distinct from old.month_to then
      raise exception 'No se puede cambiar el rango de meses de una encuesta publicada';
    end if;
  end if;
  if new.supplier_id is distinct from old.supplier_id then
    raise exception 'Una encuesta no cambia de agencia';
  end if;
  return new;
end $$;


ALTER FUNCTION "ketzal"."tg_polls_congelar_opciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."tg_require_commission_to_publish"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare r record;
begin
  if coalesce(NEW.published, false) = false then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.published, false) = true then return NEW; end if;

  select * into r from ketzal.resolve_commission_rule(NEW.id, 'plataforma', null);

  if r.basis is null
     or coalesce(r.rate, 0) <= 0 and coalesce(r.unit_amount, 0) <= 0 then
    raise exception 'No se puede publicar "%": la comisión de plataforma resuelve en cero. Define un %% general o una regla por servicio en /comisiones.', NEW.name
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;


ALTER FUNCTION "ketzal"."tg_require_commission_to_publish"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "ketzal"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."update_my_profile"("p_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_image" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare v_uid uuid := auth.uid(); v_img text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  v_img := nullif(btrim(coalesce(p_image, '')), '');
  -- La foto TIENE que vivir en nuestro bucket. Sin este candado, `image` es un
  -- campo libre que el propio usuario apunta a donde quiera y la app lo pinta:
  -- pixel de rastreo, contenido ajeno, o una URL que cambia de contenido
  -- despues de aprobarse.
  if v_img is not null and v_img not like '%/storage/v1/object/public/ketzal-assets/%' then
    raise exception 'La foto debe subirse a Ketzal.';
  end if;

  update ketzal.profiles set
    name  = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    phone = case when p_phone is null then phone
                 else nullif(btrim(p_phone), '') end,
    image = case when p_image is null then image else v_img end
  where id = v_uid;
end $$;


ALTER FUNCTION "ketzal"."update_my_profile"("p_name" "text", "p_phone" "text", "p_image" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."upsert_sales_goal"("p_agent" "uuid", "p_month" "date", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
declare
  v_super boolean := ketzal.is_superadmin();
  v_role text := (select role from ketzal.profiles where id = auth.uid());
  v_sup uuid := ketzal.my_supplier_id();
  v_target_sup uuid;
  m date := date_trunc('month', p_month)::date;
begin
  if not v_super and v_role <> 'admin' then
    raise exception 'Solo un admin puede fijar metas.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'La meta debe ser mayor que cero.';
  end if;

  if p_agent is null then
    v_target_sup := v_sup;
  else
    select supplier_id into v_target_sup from ketzal.profiles where id = p_agent;
    if not v_super and v_target_sup is distinct from v_sup then
      raise exception 'No puedes fijar metas de otra agencia.';
    end if;
  end if;
  if v_target_sup is null then
    raise exception 'No hay agencia asociada para la meta.';
  end if;

  if p_agent is null then
    insert into ketzal.sales_goals (supplier_id, agent_id, month, goal_amount)
      values (v_target_sup, null, m, round(p_amount, 2))
    on conflict (supplier_id, month) where agent_id is null
      do update set goal_amount = excluded.goal_amount, updated_at = now();
  else
    insert into ketzal.sales_goals (supplier_id, agent_id, month, goal_amount)
      values (v_target_sup, p_agent, m, round(p_amount, 2))
    on conflict (supplier_id, agent_id, month) where agent_id is not null
      do update set goal_amount = excluded.goal_amount, updated_at = now();
  end if;
end $$;


ALTER FUNCTION "ketzal"."upsert_sales_goal"("p_agent" "uuid", "p_month" "date", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."user_account_detail"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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
  full join auth.users u on u.id = p.id
  where coalesce(p.id, u.id) = p_id;

  return v;
end $$;


ALTER FUNCTION "ketzal"."user_account_detail"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."user_timeline"("p_id" "uuid", "p_limit" integer DEFAULT 300) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
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


ALTER FUNCTION "ketzal"."user_timeline"("p_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."valid_pack_price_overrides"("v" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select v is null or (
    jsonb_typeof(v) = 'object'
    and not exists (
      select 1 from jsonb_each(v) e(k, val)
      where k not in ('sencilla','doble','triple','cuadruple')
         or jsonb_typeof(val) <> 'number'
         or (val)::text::numeric <= 0
    )
  );
$$;


ALTER FUNCTION "ketzal"."valid_pack_price_overrides"("v" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."verificar_invariantes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'public'
    AS $$
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
end $$;


ALTER FUNCTION "ketzal"."verificar_invariantes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "ketzal"."wa_send_command"("p_command" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'ketzal', 'pg_temp'
    AS $$
begin
  if not ketzal.is_superadmin() then
    raise exception 'Solo el superadmin puede operar la sesión de WhatsApp.';
  end if;
  if p_command is not null and p_command not in ('restart', 'logout') then
    raise exception 'Comando no reconocido.';
  end if;

  update ketzal.wa_session
     set command = p_command,
         command_at = case when p_command is null then null else now() end,
         -- Un QR viejo no debe quedar en pantalla mientras la box reinicia.
         qr = case when p_command is null then qr else null end,
         qr_at = case when p_command is null then qr_at else null end,
         updated_at = now()
   where id = 1;
end $$;


ALTER FUNCTION "ketzal"."wa_send_command"("p_command" "text") OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "ketzal"."agency_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "role" "ketzal"."user_role" DEFAULT 'user'::"ketzal"."user_role" NOT NULL,
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "agency_invitations_role_chk" CHECK (("role" = ANY (ARRAY['user'::"ketzal"."user_role", 'admin'::"ketzal"."user_role"]))),
    CONSTRAINT "agency_invitations_status_chk" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "ketzal"."agency_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."agency_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "mensaje" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "agency_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "ketzal"."agency_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."app_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "platform_commission_rate" numeric(5,2) DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "wa_auto_enabled" boolean DEFAULT false NOT NULL,
    "wa_daily_cap" integer DEFAULT 30 NOT NULL,
    "cancellation_policy" "jsonb",
    "mp_fee_pct" numeric(6,4) DEFAULT 3.49 NOT NULL,
    "mp_fee_fijo" numeric(8,2) DEFAULT 4.00 NOT NULL,
    "mp_fee_iva" numeric(5,2) DEFAULT 16.00 NOT NULL,
    CONSTRAINT "app_settings_single_row" CHECK (("id" = 1)),
    CONSTRAINT "mp_fee_fijo_chk" CHECK (("mp_fee_fijo" >= (0)::numeric)),
    CONSTRAINT "mp_fee_iva_chk" CHECK ((("mp_fee_iva" >= (0)::numeric) AND ("mp_fee_iva" <= (100)::numeric))),
    CONSTRAINT "mp_fee_pct_chk" CHECK ((("mp_fee_pct" >= (0)::numeric) AND ("mp_fee_pct" < (100)::numeric)))
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


CREATE TABLE IF NOT EXISTS "ketzal"."booking_passengers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "passenger_type" "text",
    "doc_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "boarded_at" timestamp with time zone,
    "boarded_by" "uuid"
);


ALTER TABLE "ketzal"."booking_passengers" OWNER TO "postgres";


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
    CONSTRAINT "clawbot_reminders_kind_check" CHECK (("kind" = ANY (ARRAY['abono_por_vencer'::"text", 'abono_vencido'::"text", 'cotizacion_seguimiento'::"text", 'viaje_proximo'::"text", 'saldo_sin_plan'::"text", 'viaje_manana_operativo'::"text", 'pago_sin_recibo'::"text"]))),
    CONSTRAINT "clawbot_reminders_status_check" CHECK (("status" = ANY (ARRAY['pendiente'::"text", 'enviando'::"text", 'enviado'::"text", 'error'::"text", 'descartado'::"text"])))
);


ALTER TABLE "ketzal"."clawbot_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."commission_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "payee_type" "text" NOT NULL,
    "payee_supplier_id" "uuid",
    "basis" "text" NOT NULL,
    "rate" numeric(5,2),
    "unit_amount" numeric(12,2),
    "num_pax" integer NOT NULL,
    "amount_mxn" numeric(12,2) NOT NULL,
    "kind" "text" DEFAULT 'devengo'::"text" NOT NULL,
    "reverses_line_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payee_profile_id" "uuid",
    CONSTRAINT "commission_lines_amount_mxn_check" CHECK (("amount_mxn" >= (0)::numeric)),
    CONSTRAINT "commission_lines_basis_check" CHECK (("basis" = ANY (ARRAY['percent'::"text", 'fijo_venta'::"text", 'fijo_pax'::"text", 'hibrido'::"text"]))),
    CONSTRAINT "commission_lines_kind_check" CHECK (("kind" = ANY (ARRAY['devengo'::"text", 'reverso'::"text"]))),
    CONSTRAINT "commission_lines_payee_shape_chk" CHECK (((("payee_type" = 'plataforma'::"text") AND ("payee_supplier_id" IS NULL) AND ("payee_profile_id" IS NULL)) OR (("payee_type" = 'agencia'::"text") AND ("payee_supplier_id" IS NOT NULL) AND ("payee_profile_id" IS NULL)) OR (("payee_type" = ANY (ARRAY['embajador'::"text", 'agente'::"text"])) AND ("payee_profile_id" IS NOT NULL) AND ("payee_supplier_id" IS NULL)))),
    CONSTRAINT "commission_lines_payee_type_check" CHECK (("payee_type" = ANY (ARRAY['plataforma'::"text", 'agencia'::"text", 'embajador'::"text", 'agente'::"text"])))
);


ALTER TABLE "ketzal"."commission_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."commission_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid",
    "payee_type" "text" NOT NULL,
    "scope_supplier_id" "uuid",
    "basis" "text" NOT NULL,
    "rate" numeric(5,2),
    "unit_amount" numeric(12,2),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope_profile_id" "uuid",
    CONSTRAINT "commission_rules_basis_check" CHECK (("basis" = ANY (ARRAY['percent'::"text", 'fijo_venta'::"text", 'fijo_pax'::"text", 'hibrido'::"text"]))),
    CONSTRAINT "commission_rules_payee_type_check" CHECK (("payee_type" = ANY (ARRAY['plataforma'::"text", 'agencia'::"text", 'embajador'::"text", 'agente'::"text"]))),
    CONSTRAINT "commission_rules_rate_check" CHECK ((("rate" IS NULL) OR (("rate" >= (0)::numeric) AND ("rate" <= (100)::numeric)))),
    CONSTRAINT "commission_rules_scope_chk" CHECK (((("payee_type" = 'plataforma'::"text") AND ("scope_supplier_id" IS NULL) AND ("scope_profile_id" IS NULL)) OR (("payee_type" = 'agencia'::"text") AND ("scope_supplier_id" IS NOT NULL) AND ("scope_profile_id" IS NULL)) OR (("payee_type" = 'agente'::"text") AND ("scope_profile_id" IS NOT NULL) AND ("scope_supplier_id" IS NULL)) OR (("payee_type" = 'embajador'::"text") AND (("scope_supplier_id" IS NOT NULL) <> ("scope_profile_id" IS NOT NULL))))),
    CONSTRAINT "commission_rules_unit_amount_check" CHECK ((("unit_amount" IS NULL) OR ("unit_amount" >= (0)::numeric))),
    CONSTRAINT "commission_rules_value_chk" CHECK (((("basis" = 'percent'::"text") AND ("rate" IS NOT NULL) AND ("unit_amount" IS NULL)) OR (("basis" = ANY (ARRAY['fijo_venta'::"text", 'fijo_pax'::"text"])) AND ("unit_amount" IS NOT NULL) AND ("rate" IS NULL)) OR (("basis" = 'hibrido'::"text") AND ("rate" IS NOT NULL) AND ("unit_amount" IS NOT NULL))))
);


ALTER TABLE "ketzal"."commission_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "booking_origen_id" "uuid" NOT NULL,
    "amount_mxn" numeric(12,2) NOT NULL,
    "expires_at" "date" NOT NULL,
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credits_amount_mxn_check" CHECK (("amount_mxn" > (0)::numeric))
);


ALTER TABLE "ketzal"."credits" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marketplace_customer_id" "uuid"
);


ALTER TABLE "ketzal"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."doc_counters" (
    "supplier_id" "uuid" NOT NULL,
    "series" "text" NOT NULL,
    "last_folio" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "ketzal"."doc_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'egreso'::"text" NOT NULL,
    "reverses_expense_id" "uuid",
    "concept" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount_mxn" numeric(12,2) NOT NULL,
    "method" "text",
    "spent_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "provider_supplier_id" "uuid",
    "booking_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_profile_id" "uuid",
    CONSTRAINT "expenses_amount_mxn_check" CHECK (("amount_mxn" > (0)::numeric)),
    CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['operacion'::"text", 'transporte'::"text", 'hospedaje'::"text", 'alimentos'::"text", 'mayorista'::"text", 'embajador'::"text", 'agente'::"text", 'marketing'::"text", 'otro'::"text"]))),
    CONSTRAINT "expenses_kind_check" CHECK (("kind" = ANY (ARRAY['egreso'::"text", 'reverso'::"text"]))),
    CONSTRAINT "expenses_mayorista_provider" CHECK ((("category" <> ALL (ARRAY['mayorista'::"text", 'embajador'::"text"])) OR (("category" = 'mayorista'::"text") AND ("provider_supplier_id" IS NOT NULL)) OR (("category" = 'embajador'::"text") AND ("provider_profile_id" IS NOT NULL)))),
    CONSTRAINT "expenses_provider_chk" CHECK ((("category" <> ALL (ARRAY['mayorista'::"text", 'embajador'::"text", 'agente'::"text"])) OR (("category" = 'mayorista'::"text") AND ("provider_supplier_id" IS NOT NULL)) OR (("category" = ANY (ARRAY['embajador'::"text", 'agente'::"text"])) AND ("provider_profile_id" IS NOT NULL))))
);


ALTER TABLE "ketzal"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."funnel_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "event" "text" NOT NULL,
    "service_id" "uuid",
    "booking_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "funnel_events_event_check" CHECK (("event" = ANY (ARRAY['checkout_open'::"text", 'order_created'::"text", 'pago_metodo'::"text", 'link_click'::"text"]))),
    CONSTRAINT "funnel_events_session_id_check" CHECK ((("char_length"("session_id") >= 8) AND ("char_length"("session_id") <= 64)))
);


ALTER TABLE "ketzal"."funnel_events" OWNER TO "postgres";


COMMENT ON TABLE "ketzal"."funnel_events" IS 'ADR-0025: funnel del marketplace (pasos que la BD no ve). Deny-all: solo service role via /api/track.';



CREATE TABLE IF NOT EXISTS "ketzal"."ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "account_type" "text" NOT NULL,
    "account_supplier_id" "uuid",
    "account_profile_id" "uuid",
    "kind" "text" NOT NULL,
    "amount_mxn" numeric(12,2) NOT NULL,
    "booking_id" "uuid",
    "payment_id" "uuid",
    "commission_line_id" "uuid",
    "available_at" timestamp with time zone,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ledger_account_shape_chk" CHECK (((("account_type" = 'plataforma'::"text") AND ("account_supplier_id" IS NULL) AND ("account_profile_id" IS NULL)) OR (("account_type" = 'agencia'::"text") AND ("account_supplier_id" IS NOT NULL) AND ("account_profile_id" IS NULL)) OR (("account_type" = ANY (ARRAY['embajador'::"text", 'viajero'::"text", 'agente'::"text"])) AND ("account_profile_id" IS NOT NULL) AND ("account_supplier_id" IS NULL)))),
    CONSTRAINT "ledger_entries_account_type_check" CHECK (("account_type" = ANY (ARRAY['plataforma'::"text", 'agencia'::"text", 'embajador'::"text", 'viajero'::"text", 'agente'::"text"]))),
    CONSTRAINT "ledger_entries_amount_mxn_check" CHECK (("amount_mxn" <> (0)::numeric)),
    CONSTRAINT "ledger_entries_kind_check" CHECK (("kind" = ANY (ARRAY['devengo'::"text", 'reverso'::"text", 'fee_cobrado_split'::"text", 'cobro_por_cuenta'::"text", 'payout'::"text", 'liquidacion'::"text", 'ajuste'::"text", 'credito_emitido'::"text", 'credito_canjeado'::"text"])))
);


ALTER TABLE "ketzal"."ledger_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."mp_accounts" (
    "supplier_id" "uuid" NOT NULL,
    "mp_user_id" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "public_key" "text",
    "live_mode" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."mp_accounts" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marketplace_customer_id" "uuid",
    "receipt_url" "text",
    "split" boolean DEFAULT false NOT NULL,
    "mp_fee" numeric(12,2)
);


ALTER TABLE "ketzal"."payment_intents" OWNER TO "postgres";


COMMENT ON COLUMN "ketzal"."payment_intents"."marketplace_customer_id" IS 'Comprador B2C del intent (marketplace). Null = intent de agente (usa created_by).';



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
    "type" "ketzal"."payment_type" DEFAULT 'payment'::"ketzal"."payment_type" NOT NULL,
    "refunds_payment_id" "uuid",
    "credit_id" "uuid"
);


ALTER TABLE "ketzal"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "ketzal"."payments"."refunds_payment_id" IS 'En un asiento type=refund: el pago (type=payment) que este reembolso revierte. Null en pagos normales.';



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


CREATE TABLE IF NOT EXISTS "ketzal"."poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "option_id" integer NOT NULL,
    "preferred_month" "date" NOT NULL,
    "suggestion" "text",
    "contact" "text",
    "voter_hash" "text" NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "poll_votes_contact_check" CHECK (("char_length"("contact") <= 120)),
    CONSTRAINT "poll_votes_suggestion_check" CHECK (("char_length"("suggestion") <= 280)),
    CONSTRAINT "poll_votes_voter_hash_check" CHECK ((("char_length"("voter_hash") >= 16) AND ("char_length"("voter_hash") <= 128)))
);


ALTER TABLE "ketzal"."poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" DEFAULT "ketzal"."my_supplier_id"() NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "month_from" "date" NOT NULL,
    "month_to" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "closes_at" "date",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "polls_options_check" CHECK ((("jsonb_typeof"("options") = 'array'::"text") AND ("jsonb_array_length"("options") <= 10))),
    CONSTRAINT "polls_question_check" CHECK ((("char_length"("question") >= 1) AND ("char_length"("question") <= 200))),
    CONSTRAINT "polls_rango_meses" CHECK (("month_from" <= "month_to")),
    CONSTRAINT "polls_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text"])))
);


ALTER TABLE "ketzal"."polls" OWNER TO "postgres";


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
    "active" boolean DEFAULT false NOT NULL,
    "type" "ketzal"."profile_type" DEFAULT 'viajero'::"ketzal"."profile_type" NOT NULL,
    "phone" "text",
    "must_change_password" boolean DEFAULT false NOT NULL,
    "onboarded_at" timestamp with time zone,
    "recruited_by" "uuid"
);


ALTER TABLE "ketzal"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "ketzal"."profiles" IS 'Datos de usuario especificos de Ketzal. Identidad/login vive en auth.users.';



COMMENT ON COLUMN "ketzal"."profiles"."recruited_by" IS 'Quién invitó a esta persona a ser embajador. Hecho relacional, no dinero: el bono de b085 se DERIVA de aquí.';



CREATE TABLE IF NOT EXISTS "ketzal"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ratings_kind_check" CHECK (("kind" = ANY (ARRAY['traveler_to_provider'::"text", 'traveler_to_app'::"text", 'provider_to_traveler'::"text"]))),
    CONSTRAINT "ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "ketzal"."ratings" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "ketzal"."referral_misses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "ref_code" "text" NOT NULL,
    "ambassador_id" "uuid",
    "supplier_id" "uuid",
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."referral_misses" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "ketzal"."sales_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "month" "date" NOT NULL,
    "goal_amount" numeric NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_goals_goal_amount_check" CHECK (("goal_amount" > (0)::numeric))
);


ALTER TABLE "ketzal"."sales_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."seat_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "passenger_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "travel_date" "date" NOT NULL,
    "seat_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seat_assignments_seat_number_check" CHECK (("seat_number" >= 1))
);


ALTER TABLE "ketzal"."seat_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."service_departures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "departs_on" "date" NOT NULL,
    "max_capacity" integer NOT NULL,
    "seats_taken" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "pack_price_overrides" "jsonb",
    CONSTRAINT "departures_price_pct_chk" CHECK ((("price_pct" > ('-100'::integer)::numeric) AND ("price_pct" <= (500)::numeric))),
    CONSTRAINT "service_departures_max_capacity_check" CHECK (("max_capacity" > 0)),
    CONSTRAINT "service_departures_no_oversell" CHECK (("seats_taken" <= "max_capacity")),
    CONSTRAINT "service_departures_pack_price_overrides_chk" CHECK ("ketzal"."valid_pack_price_overrides"("pack_price_overrides")),
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
    "published" boolean DEFAULT false NOT NULL,
    "transport_type" "text",
    CONSTRAINT "services_transport_type_chk" CHECK ((("transport_type" IS NULL) OR ("transport_type" = ANY (ARRAY['autobus'::"text", 'sprinter'::"text", 'van'::"text", 'avion'::"text"]))))
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
    "owner_supplier_id" "uuid",
    "referral_code" "text"
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


CREATE TABLE IF NOT EXISTS "ketzal"."user_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "kind" "text" NOT NULL,
    "actor_id" "uuid",
    "ip" "text",
    "user_agent" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_events_kind_check" CHECK (("kind" = ANY (ARRAY['signup'::"text", 'login'::"text", 'logout'::"text", 'password_reset_request'::"text", 'password_changed'::"text", 'role_change'::"text", 'agency_change'::"text", 'activated'::"text", 'deactivated'::"text", 'invited'::"text", 'invitation_accepted'::"text", 'join_request'::"text", 'join_resolved'::"text", 'profile_updated'::"text", 'deleted'::"text", 'nota'::"text"])))
);


ALTER TABLE "ketzal"."user_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."vouchers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "folio" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."vouchers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wa_optout" (
    "phone" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "ketzal"."wa_optout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ketzal"."wa_session" (
    "id" smallint DEFAULT 1 NOT NULL,
    "state" "text" DEFAULT 'DESCONOCIDO'::"text" NOT NULL,
    "qr" "text",
    "qr_at" timestamp with time zone,
    "wa_number" "text",
    "last_seen_at" timestamp with time zone,
    "command" "text",
    "command_at" timestamp with time zone,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wa_session_command_check" CHECK ((("command" IS NULL) OR ("command" = ANY (ARRAY['restart'::"text", 'logout'::"text"])))),
    CONSTRAINT "wa_session_id_check" CHECK (("id" = 1)),
    CONSTRAINT "wa_session_state_check" CHECK (("state" = ANY (ARRAY['DESCONOCIDO'::"text", 'STARTING'::"text", 'UNPAIRED'::"text", 'CONNECTED'::"text", 'STOPPED'::"text"])))
);


ALTER TABLE "ketzal"."wa_session" OWNER TO "postgres";


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


ALTER TABLE ONLY "ketzal"."agency_invitations"
    ADD CONSTRAINT "agency_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."agency_join_requests"
    ADD CONSTRAINT "agency_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."booking_items"
    ADD CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."booking_passengers"
    ADD CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "ketzal"."commission_lines"
    ADD CONSTRAINT "commission_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."commission_rules"
    ADD CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."doc_counters"
    ADD CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("supplier_id", "series");



ALTER TABLE ONLY "ketzal"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."funnel_events"
    ADD CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."mp_accounts"
    ADD CONSTRAINT "mp_accounts_pkey" PRIMARY KEY ("supplier_id");



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



ALTER TABLE ONLY "ketzal"."poll_votes"
    ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_id_voter_hash_key" UNIQUE ("poll_id", "voter_hash");



ALTER TABLE ONLY "ketzal"."polls"
    ADD CONSTRAINT "polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."products"
    ADD CONSTRAINT "products_name_key" UNIQUE ("name");



ALTER TABLE ONLY "ketzal"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "ketzal"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "ketzal"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."ratings"
    ADD CONSTRAINT "ratings_booking_id_kind_author_id_key" UNIQUE ("booking_id", "kind", "author_id");



ALTER TABLE ONLY "ketzal"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."receipt_counters"
    ADD CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("supplier_id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_supplier_id_folio_key" UNIQUE ("supplier_id", "folio");



ALTER TABLE ONLY "ketzal"."referral_misses"
    ADD CONSTRAINT "referral_misses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."sales_goals"
    ADD CONSTRAINT "sales_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_passenger_id_key" UNIQUE ("passenger_id");



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_service_id_travel_date_seat_number_key" UNIQUE ("service_id", "travel_date", "seat_number");



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



ALTER TABLE ONLY "ketzal"."user_events"
    ADD CONSTRAINT "user_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."vouchers"
    ADD CONSTRAINT "vouchers_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "ketzal"."vouchers"
    ADD CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ketzal"."vouchers"
    ADD CONSTRAINT "vouchers_supplier_id_folio_key" UNIQUE ("supplier_id", "folio");



ALTER TABLE ONLY "ketzal"."wa_optout"
    ADD CONSTRAINT "wa_optout_pkey" PRIMARY KEY ("phone");



ALTER TABLE ONLY "ketzal"."wa_session"
    ADD CONSTRAINT "wa_session_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "agency_invitations_email_idx" ON "ketzal"."agency_invitations" USING "btree" ("lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "agency_invitations_pending_uq" ON "ketzal"."agency_invitations" USING "btree" ("lower"("email"), "supplier_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "booking_items_booking_idx" ON "ketzal"."booking_items" USING "btree" ("booking_id");



CREATE INDEX "booking_passengers_booking_idx" ON "ketzal"."booking_passengers" USING "btree" ("booking_id");



CREATE INDEX "bookings_customer_idx" ON "ketzal"."bookings" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "bookings_quote_token_idx" ON "ketzal"."bookings" USING "btree" ("quote_token");



CREATE INDEX "bookings_selling_idx" ON "ketzal"."bookings" USING "btree" ("selling_supplier_id");



CREATE INDEX "bookings_status_idx" ON "ketzal"."bookings" USING "btree" ("status");



CREATE INDEX "clawbot_owner_idx" ON "ketzal"."clawbot_reminders" USING "btree" ("sold_by", "status");



CREATE INDEX "clawbot_supplier_idx" ON "ketzal"."clawbot_reminders" USING "btree" ("supplier_id", "status");



CREATE INDEX "customers_supplier_idx" ON "ketzal"."customers" USING "btree" ("supplier_id");



CREATE INDEX "funnel_events_created_idx" ON "ketzal"."funnel_events" USING "btree" ("created_at");



CREATE INDEX "idx_bookings_marketplace_customer" ON "ketzal"."bookings" USING "btree" ("marketplace_customer_id") WHERE ("marketplace_customer_id" IS NOT NULL);



CREATE INDEX "idx_commission_lines_booking" ON "ketzal"."commission_lines" USING "btree" ("booking_id");



CREATE INDEX "idx_commission_lines_payee" ON "ketzal"."commission_lines" USING "btree" ("payee_supplier_id");



CREATE INDEX "idx_commission_rules_lookup" ON "ketzal"."commission_rules" USING "btree" ("payee_type", "scope_supplier_id", "service_id");



CREATE INDEX "idx_expenses_provider" ON "ketzal"."expenses" USING "btree" ("provider_supplier_id");



CREATE INDEX "idx_expenses_supplier" ON "ketzal"."expenses" USING "btree" ("supplier_id");



CREATE INDEX "idx_notifications_created" ON "ketzal"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_user_read" ON "ketzal"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_payments_user" ON "ketzal"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_planner_items_planner" ON "ketzal"."planner_items" USING "btree" ("planner_id");



CREATE INDEX "idx_planners_user" ON "ketzal"."travel_planners" USING "btree" ("user_id");



CREATE INDEX "idx_ratings_booking" ON "ketzal"."ratings" USING "btree" ("booking_id");



CREATE INDEX "idx_reviews_service" ON "ketzal"."reviews" USING "btree" ("service_id");



CREATE INDEX "idx_reviews_user" ON "ketzal"."reviews" USING "btree" ("user_id");



CREATE INDEX "idx_services_hotel" ON "ketzal"."services" USING "btree" ("hotel_provider_id");



CREATE INDEX "idx_services_supplier" ON "ketzal"."services" USING "btree" ("supplier_id");



CREATE INDEX "idx_services_transport" ON "ketzal"."services" USING "btree" ("transport_provider_id");



CREATE INDEX "idx_wallet_txn_wallet" ON "ketzal"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wishlist_items_wishlist" ON "ketzal"."wishlist_items" USING "btree" ("wishlist_id");



CREATE INDEX "idx_wishlists_user" ON "ketzal"."wishlists" USING "btree" ("user_id");



CREATE INDEX "ix_join_requests_supplier" ON "ketzal"."agency_join_requests" USING "btree" ("supplier_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "ledger_entries_cuenta_idx" ON "ketzal"."ledger_entries" USING "btree" ("account_type", "account_supplier_id", "account_profile_id", "created_at" DESC);



CREATE INDEX "ledger_entries_group_idx" ON "ketzal"."ledger_entries" USING "btree" ("group_id");



CREATE INDEX "notifications_user_created_idx" ON "ketzal"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "payment_intents_booking_idx" ON "ketzal"."payment_intents" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "payment_intents_mp_payment_uidx" ON "ketzal"."payment_intents" USING "btree" ("mp_payment_id") WHERE ("mp_payment_id" IS NOT NULL);



CREATE INDEX "payment_schedule_booking_idx" ON "ketzal"."payment_schedule" USING "btree" ("booking_id");



CREATE INDEX "payments_booking_idx" ON "ketzal"."payments" USING "btree" ("booking_id");



CREATE INDEX "polls_supplier_idx" ON "ketzal"."polls" USING "btree" ("supplier_id");



CREATE INDEX "profiles_recruited_by_idx" ON "ketzal"."profiles" USING "btree" ("recruited_by");



CREATE INDEX "push_subscriptions_user_idx" ON "ketzal"."push_subscriptions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "receipts_payment_id_uidx" ON "ketzal"."receipts" USING "btree" ("payment_id");



CREATE INDEX "referral_misses_amb_idx" ON "ketzal"."referral_misses" USING "btree" ("ambassador_id");



CREATE UNIQUE INDEX "sales_goals_agency_uk" ON "ketzal"."sales_goals" USING "btree" ("supplier_id", "month") WHERE ("agent_id" IS NULL);



CREATE UNIQUE INDEX "sales_goals_agent_uk" ON "ketzal"."sales_goals" USING "btree" ("supplier_id", "agent_id", "month") WHERE ("agent_id" IS NOT NULL);



CREATE INDEX "service_departures_service_idx" ON "ketzal"."service_departures" USING "btree" ("service_id");



CREATE INDEX "services_published_idx" ON "ketzal"."services" USING "btree" ("published") WHERE "published";



CREATE INDEX "suppliers_owner_idx" ON "ketzal"."suppliers" USING "btree" ("owner_supplier_id");



CREATE INDEX "system_log_ts_idx" ON "ketzal"."system_log" USING "btree" ("ts" DESC);



CREATE UNIQUE INDEX "uq_commission_lines_devengo" ON "ketzal"."commission_lines" USING "btree" ("booking_id", "payee_type", COALESCE("payee_supplier_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE ("kind" = 'devengo'::"text");



CREATE UNIQUE INDEX "uq_commission_rules" ON "ketzal"."commission_rules" USING "btree" ("payee_type", COALESCE("scope_supplier_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("scope_profile_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("service_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE "active";



CREATE UNIQUE INDEX "uq_customers_supplier_marketplace" ON "ketzal"."customers" USING "btree" ("supplier_id", "marketplace_customer_id") WHERE ("marketplace_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_join_request_pendiente" ON "ketzal"."agency_join_requests" USING "btree" ("profile_id", "supplier_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uq_payments_refund_of" ON "ketzal"."payments" USING "btree" ("refunds_payment_id") WHERE ("refunds_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_suppliers_referral_code" ON "ketzal"."suppliers" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "user_events_user_idx" ON "ketzal"."user_events" USING "btree" ("user_id", "created_at" DESC);



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



CREATE OR REPLACE TRIGGER "ledger_mirror_commission" AFTER INSERT ON "ketzal"."commission_lines" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_ledger_mirror_commission"();



CREATE OR REPLACE TRIGGER "ledger_mirror_expense" AFTER INSERT ON "ketzal"."expenses" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_ledger_mirror_expense"();



CREATE OR REPLACE TRIGGER "ledger_no_mutar" BEFORE DELETE OR UPDATE ON "ketzal"."ledger_entries" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."commission_lines" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."doc_counters" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."expenses" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."payments" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."receipt_counters" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."receipts" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."system_log" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_ledger_inmutable"();



CREATE OR REPLACE TRIGGER "tg_ledger_credit_issue" AFTER INSERT ON "ketzal"."credits" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_ledger_mirror_credit_issue"();



CREATE OR REPLACE TRIGGER "tg_ledger_credit_redeem" AFTER INSERT ON "ketzal"."payments" FOR EACH ROW WHEN ((("new"."credit_id" IS NOT NULL) AND ("new"."type" = 'payment'::"ketzal"."payment_type") AND ("new"."status" = 'COMPLETED'::"ketzal"."payment_status"))) EXECUTE FUNCTION "ketzal"."tg_ledger_mirror_credit_redeem"();



CREATE OR REPLACE TRIGGER "trg_booking_capacity" AFTER INSERT OR UPDATE ON "ketzal"."bookings" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_booking_capacity"();



CREATE OR REPLACE TRIGGER "trg_bookings_touch" BEFORE UPDATE ON "ketzal"."bookings" FOR EACH ROW EXECUTE FUNCTION "ketzal"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_categories_updated_at" BEFORE UPDATE ON "ketzal"."categories" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_commission_snapshot" AFTER INSERT OR UPDATE OF "status", "ambassador_id" ON "ketzal"."bookings" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_commission_snapshot"();



CREATE OR REPLACE TRIGGER "trg_customers_touch" BEFORE UPDATE ON "ketzal"."customers" FOR EACH ROW EXECUTE FUNCTION "ketzal"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "ketzal"."payments" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_planners_updated_at" BEFORE UPDATE ON "ketzal"."travel_planners" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_polls_congelar_opciones" BEFORE UPDATE ON "ketzal"."polls" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_polls_congelar_opciones"();



CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "ketzal"."products" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "ketzal"."profiles" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_require_commission_to_publish" BEFORE INSERT OR UPDATE OF "published" ON "ketzal"."services" FOR EACH ROW EXECUTE FUNCTION "ketzal"."tg_require_commission_to_publish"();



CREATE OR REPLACE TRIGGER "trg_service_departures_touch" BEFORE UPDATE ON "ketzal"."service_departures" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_services_updated_at" BEFORE UPDATE ON "ketzal"."services" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "ketzal"."suppliers" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallets_updated_at" BEFORE UPDATE ON "ketzal"."wallets" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wishlists_updated_at" BEFORE UPDATE ON "ketzal"."wishlists" FOR EACH ROW EXECUTE FUNCTION "ketzal"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_events_no_mutar" BEFORE DELETE OR TRUNCATE ON "ketzal"."user_events" FOR EACH STATEMENT EXECUTE FUNCTION "ketzal"."tg_bitacora_inmutable"();



ALTER TABLE ONLY "ketzal"."agency_invitations"
    ADD CONSTRAINT "agency_invitations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."agency_join_requests"
    ADD CONSTRAINT "agency_join_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ketzal"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."agency_join_requests"
    ADD CONSTRAINT "agency_join_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."agency_join_requests"
    ADD CONSTRAINT "agency_join_requests_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."booking_items"
    ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."booking_passengers"
    ADD CONSTRAINT "booking_passengers_boarded_by_fkey" FOREIGN KEY ("boarded_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."booking_passengers"
    ADD CONSTRAINT "booking_passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "ketzal"."customers"("id");



ALTER TABLE ONLY "ketzal"."bookings"
    ADD CONSTRAINT "bookings_marketplace_customer_id_fkey" FOREIGN KEY ("marketplace_customer_id") REFERENCES "ketzal"."profiles"("id");



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



ALTER TABLE ONLY "ketzal"."commission_lines"
    ADD CONSTRAINT "commission_lines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."commission_lines"
    ADD CONSTRAINT "commission_lines_payee_profile_id_fkey" FOREIGN KEY ("payee_profile_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."commission_lines"
    ADD CONSTRAINT "commission_lines_payee_supplier_id_fkey" FOREIGN KEY ("payee_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."commission_lines"
    ADD CONSTRAINT "commission_lines_reverses_line_id_fkey" FOREIGN KEY ("reverses_line_id") REFERENCES "ketzal"."commission_lines"("id");



ALTER TABLE ONLY "ketzal"."commission_rules"
    ADD CONSTRAINT "commission_rules_scope_profile_id_fkey" FOREIGN KEY ("scope_profile_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."commission_rules"
    ADD CONSTRAINT "commission_rules_scope_supplier_id_fkey" FOREIGN KEY ("scope_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."commission_rules"
    ADD CONSTRAINT "commission_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."credits"
    ADD CONSTRAINT "credits_booking_origen_id_fkey" FOREIGN KEY ("booking_origen_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."credits"
    ADD CONSTRAINT "credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "ketzal"."customers"("id");



ALTER TABLE ONLY "ketzal"."credits"
    ADD CONSTRAINT "credits_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_marketplace_customer_id_fkey" FOREIGN KEY ("marketplace_customer_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."customers"
    ADD CONSTRAINT "customers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."expenses"
    ADD CONSTRAINT "expenses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."expenses"
    ADD CONSTRAINT "expenses_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."expenses"
    ADD CONSTRAINT "expenses_provider_supplier_id_fkey" FOREIGN KEY ("provider_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."expenses"
    ADD CONSTRAINT "expenses_reverses_expense_id_fkey" FOREIGN KEY ("reverses_expense_id") REFERENCES "ketzal"."expenses"("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_account_profile_id_fkey" FOREIGN KEY ("account_profile_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_account_supplier_id_fkey" FOREIGN KEY ("account_supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_commission_line_id_fkey" FOREIGN KEY ("commission_line_id") REFERENCES "ketzal"."commission_lines"("id");



ALTER TABLE ONLY "ketzal"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."mp_accounts"
    ADD CONSTRAINT "mp_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_marketplace_customer_id_fkey" FOREIGN KEY ("marketplace_customer_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."payment_intents"
    ADD CONSTRAINT "payment_intents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."payment_schedule"
    ADD CONSTRAINT "payment_schedule_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "ketzal"."credits"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_planner_id_fkey" FOREIGN KEY ("planner_id") REFERENCES "ketzal"."travel_planners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_refunds_payment_id_fkey" FOREIGN KEY ("refunds_payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_planner_id_fkey" FOREIGN KEY ("planner_id") REFERENCES "ketzal"."travel_planners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ketzal"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."planner_items"
    ADD CONSTRAINT "planner_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "ketzal"."polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."polls"
    ADD CONSTRAINT "polls_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_recruited_by_fkey" FOREIGN KEY ("recruited_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."profiles"
    ADD CONSTRAINT "profiles_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "ketzal"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ketzal"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."ratings"
    ADD CONSTRAINT "ratings_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "ketzal"."ratings"
    ADD CONSTRAINT "ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ketzal"."payments"("id");



ALTER TABLE ONLY "ketzal"."receipts"
    ADD CONSTRAINT "receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."referral_misses"
    ADD CONSTRAINT "referral_misses_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."referral_misses"
    ADD CONSTRAINT "referral_misses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."referral_misses"
    ADD CONSTRAINT "referral_misses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."sales_goals"
    ADD CONSTRAINT "sales_goals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ketzal"."profiles"("id");



ALTER TABLE ONLY "ketzal"."sales_goals"
    ADD CONSTRAINT "sales_goals_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "ketzal"."booking_passengers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."seat_assignments"
    ADD CONSTRAINT "seat_assignments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "ketzal"."services"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "ketzal"."vouchers"
    ADD CONSTRAINT "vouchers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "ketzal"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ketzal"."vouchers"
    ADD CONSTRAINT "vouchers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "ketzal"."suppliers"("id");



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



ALTER TABLE "ketzal"."agency_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agency_invitations_sel" ON "ketzal"."agency_invitations" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



ALTER TABLE "ketzal"."agency_join_requests" ENABLE ROW LEVEL SECURITY;


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



ALTER TABLE "ketzal"."booking_passengers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_ins" ON "ketzal"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("sold_by" = "auth"."uid"()) AND (("selling_supplier_id" IS NULL) OR ("selling_supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "bookings_sel" ON "ketzal"."bookings" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "bookings_upd" ON "ketzal"."bookings" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK (("ketzal"."is_active"() AND ("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("selling_supplier_id" IS NOT NULL) AND ("selling_supplier_id" = "ketzal"."my_supplier_id"())))));



CREATE POLICY "bp_del" ON "ketzal"."booking_passengers" FOR DELETE USING (("ketzal"."is_superadmin"() OR ("ketzal"."is_active"() AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_passengers"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))))));



CREATE POLICY "bp_ins" ON "ketzal"."booking_passengers" FOR INSERT WITH CHECK (("ketzal"."is_superadmin"() OR ("ketzal"."is_active"() AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_passengers"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))))));



CREATE POLICY "bp_sel" ON "ketzal"."booking_passengers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_passengers"."booking_id") AND ("ketzal"."is_superadmin"() OR ("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))));



CREATE POLICY "bp_upd" ON "ketzal"."booking_passengers" FOR UPDATE USING (("ketzal"."is_superadmin"() OR ("ketzal"."is_active"() AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_passengers"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"()))))))))) WITH CHECK (("ketzal"."is_superadmin"() OR ("ketzal"."is_active"() AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "booking_passengers"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))))));



ALTER TABLE "ketzal"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_read" ON "ketzal"."categories" FOR SELECT USING (true);



CREATE POLICY "categories_write" ON "ketzal"."categories" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."clawbot_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clawbot_sel" ON "ketzal"."clawbot_reminders" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("sold_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



ALTER TABLE "ketzal"."commission_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commission_lines_sel" ON "ketzal"."commission_lines" FOR SELECT USING (("ketzal"."is_superadmin"() OR (("payee_supplier_id" IS NOT NULL) AND ("payee_supplier_id" = "ketzal"."my_supplier_id"())) OR (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "commission_lines"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"()))))))));



ALTER TABLE "ketzal"."commission_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commission_rules_del" ON "ketzal"."commission_rules" FOR DELETE USING (("ketzal"."is_superadmin"() OR (("payee_type" = ANY (ARRAY['agencia'::"text", 'embajador'::"text"])) AND ("scope_supplier_id" = "ketzal"."my_supplier_id"())) OR (("payee_type" = 'embajador'::"text") AND COALESCE("ketzal"."is_admin_de_embajador"("scope_profile_id"), false))));



CREATE POLICY "commission_rules_ins" ON "ketzal"."commission_rules" FOR INSERT WITH CHECK (("ketzal"."is_superadmin"() OR (("payee_type" = 'agencia'::"text") AND ("scope_supplier_id" = "ketzal"."my_supplier_id"()) AND "ketzal"."is_active"()) OR (("payee_type" = 'embajador'::"text") AND ("scope_supplier_id" = "ketzal"."my_supplier_id"()) AND "ketzal"."is_active"()) OR (("payee_type" = 'embajador'::"text") AND COALESCE("ketzal"."is_admin_de_embajador"("scope_profile_id"), false) AND "ketzal"."is_active"())));



CREATE POLICY "commission_rules_sel" ON "ketzal"."commission_rules" FOR SELECT USING (("ketzal"."is_superadmin"() OR (("payee_type" = 'agencia'::"text") AND ("scope_supplier_id" = "ketzal"."my_supplier_id"())) OR (("payee_type" = 'embajador'::"text") AND ("scope_supplier_id" = "ketzal"."my_supplier_id"())) OR (("payee_type" = 'embajador'::"text") AND COALESCE("ketzal"."is_admin_de_embajador"("scope_profile_id"), false)) OR (("scope_profile_id" IS NOT NULL) AND ("scope_profile_id" = "auth"."uid"())) OR (("payee_type" = 'embajador'::"text") AND ("scope_supplier_id" IS NOT NULL) AND COALESCE("ketzal"."is_ambassador"("auth"."uid"()), false))));



CREATE POLICY "commission_rules_upd" ON "ketzal"."commission_rules" FOR UPDATE USING (("ketzal"."is_superadmin"() OR (("payee_type" = ANY (ARRAY['agencia'::"text", 'embajador'::"text"])) AND ("scope_supplier_id" = "ketzal"."my_supplier_id"())) OR (("payee_type" = 'embajador'::"text") AND COALESCE("ketzal"."is_admin_de_embajador"("scope_profile_id"), false)))) WITH CHECK (("ketzal"."is_superadmin"() OR (("payee_type" = ANY (ARRAY['agencia'::"text", 'embajador'::"text"])) AND ("scope_supplier_id" = "ketzal"."my_supplier_id"())) OR (("payee_type" = 'embajador'::"text") AND COALESCE("ketzal"."is_admin_de_embajador"("scope_profile_id"), false))));



ALTER TABLE "ketzal"."credits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credits_sel" ON "ketzal"."credits" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



ALTER TABLE "ketzal"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_ins" ON "ketzal"."customers" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("created_by" = "auth"."uid"()) AND (("supplier_id" IS NULL) OR ("supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())));



CREATE POLICY "customers_sel" ON "ketzal"."customers" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "customers_upd" ON "ketzal"."customers" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))) WITH CHECK (("ketzal"."is_active"() AND ("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))));



ALTER TABLE "ketzal"."doc_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_scoped_ins" ON "ketzal"."expenses" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("created_by" = "auth"."uid"()) AND ("ketzal"."is_superadmin"() OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"())))));



CREATE POLICY "expenses_scoped_sel" ON "ketzal"."expenses" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



ALTER TABLE "ketzal"."funnel_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "join_requests_sel" ON "ketzal"."agency_join_requests" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"() OR "ketzal"."is_agency_admin"("supplier_id")));



ALTER TABLE "ketzal"."ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."mp_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_sel_own" ON "ketzal"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_upd_own" ON "ketzal"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "ketzal"."payment_intents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_intents_ins" ON "ketzal"."payment_intents" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("created_by" = "auth"."uid"())));



CREATE POLICY "payment_intents_sel" ON "ketzal"."payment_intents" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("created_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



CREATE POLICY "payment_intents_upd" ON "ketzal"."payment_intents" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "payment_intents"."booking_id") AND "ketzal"."es_staff_de_booking"("b".*))))));



ALTER TABLE "ketzal"."payment_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_scoped_ins" ON "ketzal"."payments" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "payments"."booking_id") AND "ketzal"."es_staff_de_booking"("b".*))))));



CREATE POLICY "payments_scoped_sel" ON "ketzal"."payments" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("user_id" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



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



ALTER TABLE "ketzal"."poll_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "poll_votes_owner_sel" ON "ketzal"."poll_votes" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR (EXISTS ( SELECT 1
   FROM "ketzal"."polls" "p"
  WHERE (("p"."id" = "poll_votes"."poll_id") AND ("p"."supplier_id" IS NOT NULL) AND COALESCE("ketzal"."is_agency_admin"("p"."supplier_id"), false))))));



ALTER TABLE "ketzal"."polls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "polls_admin_ins" ON "ketzal"."polls" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_superadmin"() OR COALESCE("ketzal"."is_agency_admin"("supplier_id"), false)));



CREATE POLICY "polls_admin_upd" ON "ketzal"."polls" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR COALESCE("ketzal"."is_agency_admin"("supplier_id"), false))) WITH CHECK (("ketzal"."is_superadmin"() OR COALESCE("ketzal"."is_agency_admin"("supplier_id"), false)));



CREATE POLICY "polls_scoped_sel" ON "ketzal"."polls" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR (("supplier_id" IS NOT NULL) AND COALESCE("ketzal"."is_agency_admin"("supplier_id"), false))));



ALTER TABLE "ketzal"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_read" ON "ketzal"."products" FOR SELECT USING (true);



CREATE POLICY "products_write" ON "ketzal"."products" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_embajadores_de_mi_agencia" ON "ketzal"."profiles" FOR SELECT USING ((("type" = 'embajador'::"ketzal"."profile_type") AND ("supplier_id" IS NOT NULL) AND COALESCE("ketzal"."is_agency_admin"("supplier_id"), false)));



CREATE POLICY "profiles_select_own" ON "ketzal"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "ketzal"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "ps_select" ON "ketzal"."payment_schedule" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("booking_id" IN ( SELECT "bookings"."id"
   FROM "ketzal"."bookings"
  WHERE (("bookings"."sold_by" = "auth"."uid"()) OR ("bookings"."selling_supplier_id" = "ketzal"."my_supplier_id"()))))));



CREATE POLICY "push_subs_del_own" ON "ketzal"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "push_subs_ins_own" ON "ketzal"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "push_subs_sel_own" ON "ketzal"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "ketzal"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ratings_sel" ON "ketzal"."ratings" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("author_id" = "auth"."uid"()) OR (("kind" = 'provider_to_traveler'::"text") AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "ratings"."booking_id") AND (("b"."sold_by" = "auth"."uid"()) OR ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))) OR (("kind" = 'traveler_to_provider'::"text") AND (EXISTS ( SELECT 1
   FROM ("ketzal"."bookings" "b"
     JOIN "ketzal"."services" "s" ON (("s"."id" = "b"."service_id")))
  WHERE (("b"."id" = "ratings"."booking_id") AND ("s"."supplier_id" = "ketzal"."my_supplier_id"())))))));



ALTER TABLE "ketzal"."receipt_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipts_ins" ON "ketzal"."receipts" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_active"() AND ("issued_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "receipts"."booking_id") AND "ketzal"."es_staff_de_booking"("b".*))))));



CREATE POLICY "receipts_sel" ON "ketzal"."receipts" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("issued_by" = "auth"."uid"()) OR (("supplier_id" IS NOT NULL) AND ("supplier_id" = "ketzal"."my_supplier_id"()))));



ALTER TABLE "ketzal"."referral_misses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_misses_sel" ON "ketzal"."referral_misses" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR (("supplier_id" IS NOT NULL) AND COALESCE("ketzal"."is_agency_admin"("supplier_id"), false)) OR ("ambassador_id" = "auth"."uid"())));



ALTER TABLE "ketzal"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete" ON "ketzal"."reviews" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



CREATE POLICY "reviews_insert" ON "ketzal"."reviews" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "reviews_read" ON "ketzal"."reviews" FOR SELECT USING (true);



CREATE POLICY "reviews_update" ON "ketzal"."reviews" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "ketzal"."is_superadmin"()));



ALTER TABLE "ketzal"."sales_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."seat_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."service_departures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_departures_owner" ON "ketzal"."service_departures" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "ketzal"."services" "s"
  WHERE (("s"."id" = "service_departures"."service_id") AND (("s"."supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "ketzal"."services" "s"
  WHERE (("s"."id" = "service_departures"."service_id") AND (("s"."supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_superadmin"())))));



ALTER TABLE "ketzal"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete" ON "ketzal"."services" FOR DELETE USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "services_insert" ON "ketzal"."services" FOR INSERT WITH CHECK (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "services_read" ON "ketzal"."services" FOR SELECT USING (("published" OR "ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"()) OR "ketzal"."is_free_agent"()));



CREATE POLICY "services_update" ON "ketzal"."services" FOR UPDATE USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"()))) WITH CHECK (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "sg_sel" ON "ketzal"."sales_goals" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("supplier_id" = "ketzal"."my_supplier_id"())));



ALTER TABLE "ketzal"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete" ON "ketzal"."suppliers" FOR DELETE TO "authenticated" USING (("ketzal"."is_superadmin"() OR (("owner_supplier_id" IS NOT NULL) AND "ketzal"."is_agency_admin"("owner_supplier_id"))));



CREATE POLICY "suppliers_insert" ON "ketzal"."suppliers" FOR INSERT TO "authenticated" WITH CHECK (("ketzal"."is_superadmin"() OR (("owner_supplier_id" IS NOT NULL) AND "ketzal"."is_agency_admin"("owner_supplier_id"))));



CREATE POLICY "suppliers_read" ON "ketzal"."suppliers" FOR SELECT USING (("ketzal"."is_superadmin"() OR ("id" = "ketzal"."my_supplier_id"()) OR ("owner_supplier_id" = "ketzal"."my_supplier_id"())));



CREATE POLICY "suppliers_update" ON "ketzal"."suppliers" FOR UPDATE TO "authenticated" USING (("ketzal"."is_superadmin"() OR "ketzal"."is_agency_admin"("id") OR (("owner_supplier_id" IS NOT NULL) AND "ketzal"."is_agency_admin"("owner_supplier_id"))));



ALTER TABLE "ketzal"."system_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_log_sel" ON "ketzal"."system_log" FOR SELECT USING ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."travel_planners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ketzal"."user_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_events_sel" ON "ketzal"."user_events" FOR SELECT TO "authenticated" USING (("ketzal"."is_superadmin"() OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "ketzal"."profiles" "p"
  WHERE (("p"."id" = "user_events"."user_id") AND ("p"."supplier_id" IS NOT NULL) AND ("p"."supplier_id" = "ketzal"."my_supplier_id"()))))));



ALTER TABLE "ketzal"."vouchers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vouchers_ins" ON "ketzal"."vouchers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "vouchers"."booking_id") AND "ketzal"."es_staff_de_booking"("b".*)))));



CREATE POLICY "vouchers_sel" ON "ketzal"."vouchers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "ketzal"."bookings" "b"
  WHERE (("b"."id" = "vouchers"."booking_id") AND ("ketzal"."is_superadmin"() OR ("b"."sold_by" = "auth"."uid"()) OR (("b"."selling_supplier_id" IS NOT NULL) AND ("b"."selling_supplier_id" = "ketzal"."my_supplier_id"())))))));



ALTER TABLE "ketzal"."wa_optout" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wa_optout_admin" ON "ketzal"."wa_optout" USING ("ketzal"."is_superadmin"()) WITH CHECK ("ketzal"."is_superadmin"());



ALTER TABLE "ketzal"."wa_session" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wa_session_sel" ON "ketzal"."wa_session" FOR SELECT TO "authenticated" USING ("ketzal"."is_superadmin"());



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



REVOKE ALL ON FUNCTION "ketzal"."accept_booking_policy"("p_booking" "uuid", "p_canal" "text", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."accept_booking_policy"("p_booking" "uuid", "p_canal" "text", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."accept_booking_policy"("p_booking" "uuid", "p_canal" "text", "p_meta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."accept_pending_invitation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."accept_pending_invitation"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."accept_pending_invitation"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."accept_policy_by_token"("p_token" "uuid", "p_meta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."add_my_passenger"("p_booking_id" "uuid", "p_full_name" "text", "p_type" "text", "p_doc" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."add_my_passenger"("p_booking_id" "uuid", "p_full_name" "text", "p_type" "text", "p_doc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."add_my_passenger"("p_booking_id" "uuid", "p_full_name" "text", "p_type" "text", "p_doc" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."agency_name"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."agency_name"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."alertas_anomalias_dinero"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."alertas_anomalias_dinero"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."ambassador_payables_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."ambassador_payables_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."assign_seat"("p_passenger_id" "uuid", "p_seat" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."assign_seat"("p_passenger_id" "uuid", "p_seat" integer) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."assign_seat"("p_passenger_id" "uuid", "p_seat" integer) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."assign_user_agency"("p_user" "uuid", "p_supplier" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."attribute_booking_by_ref"("p_booking" "uuid", "p_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."attribute_booking_by_ref"("p_booking" "uuid", "p_ref" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."attribute_booking_by_ref"("p_booking" "uuid", "p_ref" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."board_passenger"("p_passenger_id" "uuid", "p_board" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."board_passenger"("p_passenger_id" "uuid", "p_board" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."board_passenger"("p_passenger_id" "uuid", "p_board" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."boarding_info"("p_voucher_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."boarding_info"("p_voucher_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."boarding_info"("p_voucher_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."bonos_reclutador"("p_uid" "uuid", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."bonos_reclutador"("p_uid" "uuid", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."bonos_reclutador"("p_uid" "uuid", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."can_view_user"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."can_view_user"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."can_view_user"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."cancel_booking_v2"("p_booking" "uuid", "p_reason" "text", "p_mode" "text", "p_waive_fee" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."cancel_booking_v2"("p_booking" "uuid", "p_reason" "text", "p_mode" "text", "p_waive_fee" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."cancel_booking_v2"("p_booking" "uuid", "p_reason" "text", "p_mode" "text", "p_waive_fee" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."cancel_join_request"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."cancel_join_request"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."cancel_join_request"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."claim_quote"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."claim_quote"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."claim_quote"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_bandeja"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_bandeja"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_claim_pendientes"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_claim_pendientes"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_descartar"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_generar_recordatorios"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_generar_recordatorios"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_marcar_bot"("p_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_marcar_bot"("p_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_marcar_enviado"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_reglas_operativas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_reglas_operativas"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."clawbot_reglas_operativas"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clawbot_resumen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clawbot_resumen"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."clear_password_change_flag"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clear_password_change_flag"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."clear_password_change_flag"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."clear_payment_plan"("p_booking_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."cobranza"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."commissions_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."commissions_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text", "p_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."confirm_online_payment"("p_intent_id" "uuid", "p_mp_payment_id" "text", "p_status" "text", "p_method" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."conversion_summary"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."conversion_summary"("p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."convert_quote_to_sale"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."corte_embajadores"("p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."corte_embajadores"("p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."corte_embajadores"("p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_booking_with_items"("p_customer_id" "uuid", "p_new_customer" "jsonb", "p_service_id" "uuid", "p_travel_date" "date", "p_discount" numeric, "p_notes" "text", "p_items" "jsonb", "p_status" "ketzal"."booking_status") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_expense"("p_concept" "text", "p_category" "text", "p_amount" numeric, "p_method" "text", "p_spent_at" "date", "p_provider_supplier_id" "uuid", "p_booking_id" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_expense"("p_concept" "text", "p_category" "text", "p_amount" numeric, "p_method" "text", "p_spent_at" "date", "p_provider_supplier_id" "uuid", "p_booking_id" "uuid", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_marketplace_order"("p_service_id" "uuid", "p_travel_date" "date", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_marketplace_order"("p_service_id" "uuid", "p_travel_date" "date", "p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_marketplace_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_marketplace_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."create_payment_intent"("p_booking_id" "uuid", "p_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."dashboard_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."dashboard_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."delete_my_draft_order"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."delete_my_draft_order"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."delete_sales_goal"("p_agent" "uuid", "p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."delete_sales_goal"("p_agent" "uuid", "p_month" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."departure_lists"("p_departure_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."departure_lists"("p_departure_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."departure_lists"("p_departure_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."effective_cancellation_policy"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."effective_cancellation_policy"("p_supplier" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."effective_cancellation_policy"("p_supplier" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."email_verificado"("p_uid" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."emit_my_voucher"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."emit_my_voucher"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."emit_receipt"("p_payment_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."emit_voucher"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."emit_voucher"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."ensure_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."ensure_profile"() TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."ensure_statement_token"("p_booking_id" "uuid") TO "authenticated";



GRANT SELECT,INSERT,DELETE ON TABLE "ketzal"."bookings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings" TO "service_role";



GRANT UPDATE("currency") ON TABLE "ketzal"."bookings" TO "authenticated";



GRANT UPDATE("status") ON TABLE "ketzal"."bookings" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "ketzal"."bookings" TO "authenticated";



GRANT UPDATE("cancel_reason") ON TABLE "ketzal"."bookings" TO "authenticated";



GRANT UPDATE("statement_token") ON TABLE "ketzal"."bookings" TO "authenticated";



GRANT UPDATE("exchange_rate") ON TABLE "ketzal"."bookings" TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."es_staff_de_booking"("p_booking" "ketzal"."bookings") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."es_staff_de_booking"("p_booking" "ketzal"."bookings") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."es_staff_de_booking"("p_booking" "ketzal"."bookings") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."expenses_summary"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."expenses_summary"("p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."find_auth_user_id"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."find_auth_user_id"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."generate_marketplace_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."generate_marketplace_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date", "p_down_pct" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."generate_payment_plan"("p_booking_id" "uuid", "p_frequency" "text", "p_final_date" "date", "p_down_pct" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_booking_checkout_key"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_booking_checkout_key"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."get_booking_checkout_key"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "ketzal"."get_brand_logo"() TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_brand_logo"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_departure_detail"("p_departure_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_departure_detail"("p_departure_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."get_my_trip"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_currency"("p_kind" "text", "p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."get_public_doc_policy"("p_kind" "text", "p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."get_public_poll"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_service"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_public_supplier"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_public_supplier"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_public_supplier"("p_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_quote_by_token"("p_token" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_receipt_public"("p_receipt_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."get_service_reviews"("p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_service_reviews"("p_service_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_statement_by_token"("p_token" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_supplier_rating"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_supplier_rating"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_supplier_rating"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."get_voucher_public"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."get_voucher_public"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."get_voucher_public"("p_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "ketzal"."global_search"("p_q" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."goals_progress"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."goals_progress"("p_month" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."invite_agent"("p_email" "text", "p_role" "ketzal"."user_role", "p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."invite_agent"("p_email" "text", "p_role" "ketzal"."user_role", "p_supplier" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."invite_agent"("p_email" "text", "p_role" "ketzal"."user_role", "p_supplier" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."is_admin_de_embajador"("p_profile" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."is_admin_de_embajador"("p_profile" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."is_admin_de_embajador"("p_profile" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."is_agency_admin"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."is_agency_admin"("p_supplier" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."is_agency_admin"("p_supplier" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."is_ambassador"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."is_ambassador"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."is_ambassador"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."is_free_agent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."is_free_agent"() TO "anon";
GRANT ALL ON FUNCTION "ketzal"."is_free_agent"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."is_free_agent"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."ledger_post"("p_entries" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."ledger_statement"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."ledger_statement"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."ledger_statement"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."ledger_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."ledger_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."ledger_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."link_my_customers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."link_my_customers"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."link_my_customers"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."link_profile_customers"("p_uid" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."list_agencies_to_join"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_agencies_to_join"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_agencies_to_join"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_agency_invitations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_agency_invitations"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_agency_invitations"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_agency_names"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_agency_names"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_agents_for_commission"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_agents_for_commission"("p_supplier" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_ambassadors"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_ambassadors"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_ambassadors"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_customer_credits"("p_customer" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_customer_credits"("p_customer" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_customer_credits"("p_customer" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_customers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_customers"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_departures"("p_from" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_departures"("p_from" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_join_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_join_requests"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_join_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_my_credits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_my_credits"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_my_credits"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_my_marketplace_orders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_my_marketplace_orders"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_my_passengers"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_my_passengers"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_my_passengers"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_pending_spei"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_pending_spei"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_pending_spei"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_public_services"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_public_services"() TO "anon";
GRANT ALL ON FUNCTION "ketzal"."list_public_services"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_public_suppliers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_public_suppliers"() TO "anon";
GRANT ALL ON FUNCTION "ketzal"."list_public_suppliers"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_rejected_spei"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_rejected_spei"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_rejected_spei"("p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."list_team"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_team"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_traveler_purchases"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_traveler_purchases"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_travelers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_travelers"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."list_users"("p_q" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."list_users"("p_q" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."list_users"("p_q" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."log_sistema"("p_source" "text", "p_level" "text", "p_event" "text", "p_detail" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."log_user_event"("p_user" "uuid", "p_kind" "text", "p_meta" "jsonb", "p_ip" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."log_user_event"("p_user" "uuid", "p_kind" "text", "p_meta" "jsonb", "p_ip" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."log_user_event"("p_user" "uuid", "p_kind" "text", "p_meta" "jsonb", "p_ip" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."marcar_onboarding_visto"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."marcar_onboarding_visto"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."marcar_onboarding_visto"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."mp_account_status"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."mp_account_status"("p_supplier" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."mp_account_status"("p_supplier" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."my_ambassador_earnings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."my_ambassador_earnings"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."my_ambassador_earnings"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."my_ambassador_payments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."my_ambassador_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."my_ambassador_payments"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."my_link_clicks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."my_link_clicks"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."my_link_clicks"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."my_profile_type"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."my_profile_type"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."my_profile_type"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."my_provider_services"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."my_provider_services"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."my_provider_services"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."next_doc_folio"("p_supplier" "uuid", "p_series" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."next_doc_folio"("p_supplier" "uuid", "p_series" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."next_receipt_folio"("p_supplier" "uuid") TO "authenticated";



GRANT SELECT,UPDATE ON TABLE "ketzal"."notifications" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."notifications" TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."notification_create_self"("p_title" "text", "p_message" "text", "p_type" "ketzal"."notification_type", "p_priority" "ketzal"."notification_priority", "p_metadata" "jsonb", "p_action_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."onboarding_agencia"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."onboarding_agencia"() TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."onboarding_agencia"() TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."pagar_corte_embajador"("p_embajador" "uuid", "p_agencia" "uuid", "p_monto" numeric, "p_fecha" "date", "p_metodo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."pagar_corte_embajador"("p_embajador" "uuid", "p_agencia" "uuid", "p_monto" numeric, "p_fecha" "date", "p_metodo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."pagar_corte_embajador"("p_embajador" "uuid", "p_agencia" "uuid", "p_monto" numeric, "p_fecha" "date", "p_metodo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."payables_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."payables_summary"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."platform_fee_for_payment"("p_booking" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."platform_fee_for_payment"("p_booking" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."platform_fee_for_payment"("p_booking" "uuid", "p_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."preview_cancellation"("p_booking" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."preview_cancellation"("p_booking" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."preview_cancellation"("p_booking" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "ketzal"."preview_payment_plan"("p_total" numeric, "p_final" "date", "p_frequency" "text", "p_down_pct" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."puede_operar_booking"("p_booking" "ketzal"."bookings") FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."puedo_subir_comprobante"("p_booking" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."puedo_subir_comprobante"("p_booking" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."redeem_credit"("p_credit" "uuid", "p_booking" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."redeem_credit"("p_credit" "uuid", "p_booking" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."redeem_credit"("p_credit" "uuid", "p_booking" "uuid", "p_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."refund_payment_partial"("p_payment_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."refund_payment_partial"("p_payment_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."refund_payment_partial"("p_payment_id" "uuid", "p_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."register_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_method" "text", "p_paid_at" timestamp with time zone, "p_type" "ketzal"."payment_type") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."register_traveler"("p_full_name" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."register_traveler"("p_full_name" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."register_traveler"("p_full_name" "text", "p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."release_seat"("p_passenger_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."release_seat"("p_passenger_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."release_seat"("p_passenger_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."remove_my_passenger"("p_passenger_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."remove_my_passenger"("p_passenger_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."remove_my_passenger"("p_passenger_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."reopen_spei_payment"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."reopen_spei_payment"("p_intent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."reopen_spei_payment"("p_intent_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."reports_summary"("p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."request_join_agency"("p_supplier" "uuid", "p_mensaje" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."request_join_agency"("p_supplier" "uuid", "p_mensaje" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."request_join_agency"("p_supplier" "uuid", "p_mensaje" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."resolve_join_request"("p_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."resolve_join_request"("p_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."resolve_join_request"("p_id" "uuid", "p_approve" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."resolve_spei_payment"("p_intent_id" "uuid", "p_approve" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."resolve_spei_payment"("p_intent_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."resolve_spei_payment"("p_intent_id" "uuid", "p_approve" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."reverse_expense"("p_expense_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."reverse_expense"("p_expense_id" "uuid", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."revoke_invitation"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."revoke_invitation"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."revoke_invitation"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."salud_sistema"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."salud_sistema"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."seat_map_for_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."seat_map_for_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."seat_map_for_booking"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."set_agency_member_role"("p_user" "uuid", "p_role" "ketzal"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_agency_member_role"("p_user" "uuid", "p_role" "ketzal"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."set_agency_member_role"("p_user" "uuid", "p_role" "ketzal"."user_role") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."set_booking_ambassador"("p_booking" "uuid", "p_ambassador" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_booking_ambassador"("p_booking" "uuid", "p_ambassador" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."set_booking_ambassador"("p_booking" "uuid", "p_ambassador" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."set_booking_currency"("p_booking_id" "uuid", "p_currency" "text", "p_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_booking_currency"("p_booking_id" "uuid", "p_currency" "text", "p_rate" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."set_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_basis" "text", "p_rate" numeric, "p_unit" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_basis" "text", "p_rate" numeric, "p_unit" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."set_commission_rule"("p_service" "uuid", "p_payee_type" "text", "p_scope" "uuid", "p_basis" "text", "p_rate" numeric, "p_unit" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."set_referral_code"("p_profile" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_referral_code"("p_profile" "uuid", "p_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_user_active"("p_user" "uuid", "p_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."set_user_role"("p_user" "uuid", "p_role" "ketzal"."user_role") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."settle_ledger"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_amount" numeric, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."settle_ledger"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_amount" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."settle_ledger"("p_account_type" "text", "p_supplier" "uuid", "p_profile" "uuid", "p_amount" numeric, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."snapshot_booking_policy"("p_booking" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."snapshot_booking_policy"("p_booking" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."snapshot_booking_policy"("p_booking" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text", "p_contact" "text", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text", "p_contact" "text", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text", "p_contact" "text", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."submit_poll_vote"("p_poll" "uuid", "p_option" integer, "p_month" "date", "p_voter_hash" "text", "p_suggestion" "text", "p_contact" "text", "p_meta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."submit_rating"("p_booking_id" "uuid", "p_kind" "text", "p_rating" integer, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."submit_rating"("p_booking_id" "uuid", "p_kind" "text", "p_rating" integer, "p_comment" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."submit_spei_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_reference" "text", "p_receipt_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."submit_spei_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_reference" "text", "p_receipt_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."submit_spei_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_reference" "text", "p_receipt_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."tg_bitacora_inmutable"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."tg_booking_capacity"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."tg_commission_snapshot"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."tg_ledger_mirror_credit_issue"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."tg_ledger_mirror_credit_redeem"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "ketzal"."update_my_profile"("p_name" "text", "p_phone" "text", "p_image" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."update_my_profile"("p_name" "text", "p_phone" "text", "p_image" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."update_my_profile"("p_name" "text", "p_phone" "text", "p_image" "text") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."upsert_sales_goal"("p_agent" "uuid", "p_month" "date", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."upsert_sales_goal"("p_agent" "uuid", "p_month" "date", "p_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."user_account_detail"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."user_account_detail"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."user_account_detail"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."user_timeline"("p_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."user_timeline"("p_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."user_timeline"("p_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "ketzal"."valid_pack_price_overrides"("v" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."valid_pack_price_overrides"("v" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "ketzal"."verificar_invariantes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."verificar_invariantes"() TO "service_role";
GRANT ALL ON FUNCTION "ketzal"."verificar_invariantes"() TO "authenticated";



REVOKE ALL ON FUNCTION "ketzal"."wa_send_command"("p_command" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "ketzal"."wa_send_command"("p_command" "text") TO "authenticated";
GRANT ALL ON FUNCTION "ketzal"."wa_send_command"("p_command" "text") TO "service_role";



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



GRANT SELECT ON TABLE "ketzal"."agency_invitations" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."agency_invitations" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."agency_join_requests" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."agency_join_requests" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."app_settings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."app_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_passengers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."booking_passengers" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings_with_balance" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."bookings_with_balance" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."categories" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."categories" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."categories" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."clawbot_reminders" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."clawbot_reminders" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."commission_lines" TO "authenticated";
GRANT SELECT ON TABLE "ketzal"."commission_lines" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."commission_rules" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."commission_rules" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."credits" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."credits" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."customers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."customers" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."doc_counters" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."doc_counters" TO "service_role";



GRANT SELECT,INSERT ON TABLE "ketzal"."expenses" TO "authenticated";
GRANT SELECT,INSERT ON TABLE "ketzal"."expenses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."funnel_events" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."ledger_entries" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."mp_accounts" TO "service_role";



GRANT SELECT,INSERT,DELETE ON TABLE "ketzal"."payment_intents" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_intents" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_schedule" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."payment_schedule" TO "service_role";



GRANT SELECT,INSERT ON TABLE "ketzal"."payments" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."payments" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."planner_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."planner_items" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."poll_votes" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."poll_votes" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."polls" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."polls" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."products" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."products" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."products" TO "anon";



GRANT SELECT ON TABLE "ketzal"."profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."push_subscriptions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."push_subscriptions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."ratings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."ratings" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipt_counters" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipt_counters" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipts" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "ketzal"."receipts" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."referral_misses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."referral_misses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."reviews" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."reviews" TO "service_role";
GRANT SELECT ON TABLE "ketzal"."reviews" TO "anon";



GRANT SELECT ON TABLE "ketzal"."sales_goals" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."sales_goals" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."seat_assignments" TO "service_role";



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



GRANT SELECT ON TABLE "ketzal"."user_events" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."user_events" TO "service_role";



GRANT SELECT,INSERT ON TABLE "ketzal"."vouchers" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."vouchers" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wa_optout" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wa_optout" TO "service_role";



GRANT SELECT ON TABLE "ketzal"."wa_session" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wa_session" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallet_transactions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wallet_transactions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlist_items" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlist_items" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlists" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "ketzal"."wishlists" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "ketzal" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "ketzal" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "service_role";




