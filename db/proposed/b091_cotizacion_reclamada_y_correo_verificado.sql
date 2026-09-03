-- b091 — La cotización se guarda en la cuenta del viajero con su TOKEN; el
-- correo liga cuentas solo cuando está VERIFICADO. (ADR-0039)
--
-- Migración aplicada: `b091_cotizacion_reclamada_y_correo_verificado` (2026-09-03).
--
-- Problema: el agente registra un prospecto (`customers`) y le cotiza (booking
-- con `quote_token`); el prospecto abre /cotizacion/<token> desde WhatsApp y ahí
-- se acaba: no hay forma de que esa cotización viva en una cuenta de viajero.
-- `/mis-compras` (`list_my_marketplace_orders`, `get_my_trip`) filtra SOLO por
-- `bookings.marketplace_customer_id = auth.uid()`, y una venta del back-office
-- nace con `customer_id` puesto y `marketplace_customer_id` null. b056 ya nombraba
-- el hueco ("se cierra ligando ese cliente a un perfil"); esto lo cierra.
--
-- Dos puertas, las dos escriben `bookings.marketplace_customer_id` (y
-- `customers.marketplace_customer_id` cuando no choca con el índice único):
--
--   1) `claim_quote(p_token)` — quien TIENE el link se lleva ESA cotización. El
--      token es la capability; no se casa por correo ni por teléfono, que los
--      teclea el agente sin verificar. Primer reclamo gana; un segundo perfil
--      recibe error explícito (no silencio). Idempotente para el dueño.
--
--   2) `link_my_customers()` — barrido por correo, SOLO si el correo de la cuenta
--      está verificado (`email_verificado`): confirmado tras un envío real
--      (`confirmation_sent_at` no nulo) o identidad Google con `email_verified`.
--      Una cuenta auto-confirmada (proyecto con "Confirm email" apagado) NO liga:
--      falla cerrado. Lo llama /mis-compras al cargar: idempotente y barato.
--
-- Y la venta de canal `manual` queda de SOLO LECTURA en el portal: pagar (MP y
-- SPEI), borrar el draft, regenerar el plan y subir comprobante exigen
-- `channel = 'portal'`. La cobranza la sigue llevando el agente. Sin este gate,
-- ligar la cotización dejaba al prospecto borrar el draft del agente
-- (`delete_my_draft_order`) o meterle un plan de pagos encima.
--
-- `list_my_marketplace_orders` y `get_my_trip` devuelven `channel` (aditivo)
-- para que la UI esconda lo que el RPC de todas formas rechazaría.
--
-- Re-aplicado ADITIVAMENTE desde el DDL vivo (2026-09-03): los cuerpos de los
-- seis RPC existentes son los de producción + el gate / la columna nueva.

-- ---------------------------------------------------------------- helpers ---

-- ¿El correo de esta cuenta lo confirmó su dueño? Auto-confirmación (Admin API
-- o "Confirm email" apagado) deja `confirmation_sent_at` en null ⇒ false.
create or replace function ketzal.email_verificado(p_uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce((
    select u.email_confirmed_at is not null
       and (u.confirmation_sent_at is not null
            or exists (select 1 from auth.identities i
                        where i.user_id = u.id and i.provider = 'google'
                          and coalesce(i.identity_data->>'email_verified','') = 'true'))
      from auth.users u where u.id = p_uid
  ), false);
$function$;
revoke all on function ketzal.email_verificado(uuid) from public, anon, authenticated;

-- Liga a un perfil las filas de `customers` (y sus bookings) cuyo correo coincide
-- con el correo VERIFICADO de la cuenta. Devuelve cuántos clientes ligó.
create or replace function ketzal.link_profile_customers(p_uid uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;
revoke all on function ketzal.link_profile_customers(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------- puerta 2 ----
create or replace function ketzal.link_my_customers()
 returns integer
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from ketzal.profiles p where p.id = v_uid) then return 0; end if;
  return ketzal.link_profile_customers(v_uid);
end $function$;
revoke all on function ketzal.link_my_customers() from public, anon;
grant execute on function ketzal.link_my_customers() to authenticated, service_role;

-- ------------------------------------------------------------- puerta 1 ----
create or replace function ketzal.claim_quote(p_token uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;
revoke all on function ketzal.claim_quote(uuid) from public, anon;
grant execute on function ketzal.claim_quote(uuid) to authenticated, service_role;

-- ------------------------------------------ canal manual = solo lectura ----

create or replace function ketzal.delete_my_draft_order(p_booking_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
$function$;

create or replace function ketzal.create_marketplace_payment_intent(p_booking_id uuid, p_amount numeric default null::numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

create or replace function ketzal.submit_spei_payment(p_booking_id uuid, p_amount numeric, p_reference text default null::text, p_receipt_url text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

create or replace function ketzal.generate_marketplace_payment_plan(p_booking_id uuid, p_frequency text, p_final_date date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'public'
as $function$
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
end $function$;

-- Guard de Storage para subir comprobantes: solo pedidos del portal.
create or replace function ketzal.puedo_subir_comprobante(p_booking uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce((
    select b.marketplace_customer_id = auth.uid() and b.channel = 'portal'
      from ketzal.bookings b
     where b.id = p_booking and b.status <> 'cancelled'
  ), false);
$function$;

-- ------------------------------------------------ lecturas: + channel ----

create or replace function ketzal.list_my_marketplace_orders()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

create or replace function ketzal.get_my_trip(p_booking_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;
