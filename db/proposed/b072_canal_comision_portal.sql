-- b072 — Canal de venta como discriminante de comisión de plataforma + blindaje.
--
-- Regla de negocio (fundador, 2026-08): Ketzal cobra comisión SOLO por ventas
-- del PORTAL (marketplace / embajador). Una venta manual capturada por la
-- agencia en /ventas/nueva NO comisiona — ya paga mensualidad de SaaS.
--
-- Antes esto era EMERGENTE, no declarativo: el trigger infería el canal de si
-- `marketplace_customer_id` quedó nulo. Dos problemas:
--   1) `marketplace_customer_id` es una columna que el vendedor puede editar por
--      PostgREST (GRANT UPDATE de tabla + policy sin columnas) ⇒ podía borrarla
--      en un draft y evadir la comisión. Familia #1 de bugs del repo (ADR-0006).
--   2) La puerta `selling_supplier_id is null` devengaba 10% a plataforma en
--      CUALQUIER venta de un agente sin agencia (los superadmins), incluso
--      capturada 100% a mano. Contradecía la regla.
--
-- Fix: columna `channel` INMUTABLE (blindada por grant column-level), poblada
-- por el RPC de alta de cada canal. El trigger devenga plataforma sólo si
-- `channel='portal'`. Espejo de la migración aplicada a prod (uznqmmeqwbbjkotbxwsw).

-- ── 1. La columna discriminante ──────────────────────────────────────────────
alter table ketzal.bookings
  add column if not exists channel text not null default 'manual';

do $$ begin
  alter table ketzal.bookings
    add constraint bookings_channel_chk check (channel in ('manual','portal'));
exception when duplicate_object then null; end $$;

-- Backfill por la señal que se usaba hasta hoy: un pedido con comprador B2C
-- ligado nació en el portal; el resto es captura manual de agente.
update ketzal.bookings
   set channel = 'portal'
 where marketplace_customer_id is not null and channel <> 'portal';

-- ── 2. El alta del portal marca el canal (re-apply aditivo desde el DDL vivo) ─
-- Único cambio vs la versión viva: `channel` en la lista de columnas del INSERT
-- de bookings, con valor 'portal'. Todo lo demás idéntico.
create or replace function ketzal.create_marketplace_order(p_service_id uuid, p_travel_date date, p_items jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

-- ── 3. El trigger devenga plataforma SÓLO en el portal (re-apply aditivo) ─────
-- Cambio vs la versión viva: el bloque 'plataforma' ahora dispara con
-- `NEW.channel = 'portal'` en vez de `(selling_supplier_id is null or
-- marketplace_customer_id is not null)`. Los bloques 'agencia' (reventa) y
-- 'agente' (b054) quedan IDÉNTICOS.
create or replace function ketzal.tg_commission_snapshot()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record; v_amt numeric(12,2);
begin
  if NEW.status not in ('reserved','confirmed','paid') then return NEW; end if;

  -- Comisión de plataforma (Ketzal): SÓLO ventas del portal (marketplace /
  -- embajador). Venta manual de agencia = SaaS, no comisiona (b072).
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

  -- b054: comisión al agente individual que cerró la venta (bookings.sold_by).
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

  return NEW;
end $function$;

-- ── 4. Blindaje: el canal y las cifras de la venta NO son escribibles por REST ─
-- `authenticated` tenía UPDATE de tabla completa (heredado). Se restringe a las
-- columnas que las 7 funciones INVOKER realmente escriben (verificado contra el
-- DDL vivo: status/cancel_reason/updated_at/statement_token/currency/exchange_rate).
-- Todo lo demás —channel, total, subtotal, marketplace_customer_id,
-- selling_supplier_id, sold_by…— queda cerrado a PostgREST directo. Los RPCs
-- DEFINER (confirm_online_payment, planes, cancelaciones) corren como owner y no
-- dependen de este grant.
revoke update on ketzal.bookings from authenticated;
grant update (status, cancel_reason, updated_at, statement_token, currency, exchange_rate)
  on ketzal.bookings to authenticated;

-- payment_intents: nadie INVOKER lo ACTUALIZA (create_payment_intent sólo
-- inserta; confirm/reopen/resolve_spei son DEFINER). Cerrar UPDATE mata el hueco
-- de poner mp_fee=0 o split=false entre la creación del intent y su confirmación.
revoke update on ketzal.payment_intents from authenticated;
