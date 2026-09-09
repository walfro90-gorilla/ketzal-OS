-- b103 — El viajero ve sus pedidos cancelados y cuánto se le devolvió.
--
-- Migración aplicada: `b103_pedidos_cancelados_y_devueltos_visibles` (2026-09-09).
--
-- Tras el primer reembolso real, la compra de prueba del fundador desapareció de
-- Mis compras: `list_my_marketplace_orders` y `get_my_trip` filtraban
-- `status <> 'cancelled'`. Un pedido cancelado es historia del viajero, no ruido:
-- se lista, se abre y dice cuánto volvió.
--
--   · list_my_marketplace_orders: quita el filtro de cancelados; agrega `refunded`
--     = suma de `payments.amount_mxn` con type = 'refund' y status = 'COMPLETED'.
--   · get_my_trip: quita el filtro; `money.refunded` con la misma suma.
--
-- Re-aplicado desde el DDL vivo (b102); solo cambian las líneas marcadas "b103".
-- El cuerpo completo es el de b102 con esas tres líneas; está en
-- `supabase_migrations.schema_migrations` (versión b103).

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
        b.channel,
        coalesce(sv.name, 'Viaje') as service_name,
        bwb.total, bwb.paid, bwb.balance,
        -- b103: lo devuelto al viajero (pagos tipo refund completados).
        (select coalesce(sum(p.amount_mxn), 0) from ketzal.payments p
          where p.booking_id = b.id and p.type = 'refund' and p.status = 'COMPLETED') as refunded,
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
        (b.status = 'paid' and b.travel_date is not null and b.travel_date <= current_date) as can_rate,
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
      -- b103: los cancelados también se ven (con su devolución); antes desaparecían.
      where b.marketplace_customer_id = v_uid
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
      'channel', b.channel),
    'money', jsonb_build_object('total', bwb.total, 'paid', bwb.paid, 'balance', bwb.balance,
      -- b103
      'refunded', (select coalesce(sum(p.amount_mxn), 0) from ketzal.payments p
                    where p.booking_id = b.id and p.type = 'refund' and p.status = 'COMPLETED')),
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
    'voucher_id', vch.id,
    'rating', jsonb_build_object(
      'can_rate', (b.status = 'paid' and b.travel_date is not null and b.travel_date <= current_date),
      'rated_provider', exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid),
      'rated_app',      exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid),
      'provider_rating',  (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid),
      'provider_comment', (select r.comment from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid),
      'app_rating',       (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid))
  ) into v
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.services sv on sv.id = b.service_id
  left join ketzal.suppliers sup on sup.id = sv.supplier_id
  left join ketzal.vouchers vch on vch.booking_id = b.id
  -- b103: el detalle de un pedido cancelado también se abre.
  where b.id = p_booking_id and b.marketplace_customer_id = v_uid;
  return v;
end $function$;
