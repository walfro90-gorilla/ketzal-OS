-- b102 — Calificar solo después del viaje; la calificación viaja en el detalle.
--
-- Migración aplicada: `b102_calificar_solo_despues_del_viaje` (2026-09-09).
--
-- El fundador compró un tour de prueba y "Califica tu viaje" apareció al
-- instante. `can_rate` era `pagado y (sin fecha o fecha pasada)`: un pedido sin
-- fecha de viaje se calificaba al pagar. Sin fecha no hay viaje que calificar.
--
--   · submit_rating: exige `travel_date is not null and travel_date <= current_date`.
--     La UI que esconde el bloque no es la frontera; la BD lo es.
--   · list_my_marketplace_orders: misma regla en `can_rate`.
--   · get_my_trip: bloque `rating` para que el detalle pinte la reseña.
--
-- Re-aplicado desde el DDL vivo (pg_get_functiondef); solo cambian las líneas
-- marcadas "b102".

create or replace function ketzal.submit_rating(p_booking_id uuid, p_kind text, p_rating integer, p_comment text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_b ketzal.bookings; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'La calificación debe ser de 1 a 5.'; end if;
  if p_kind not in ('traveler_to_provider','traveler_to_app','provider_to_traveler') then
    raise exception 'Tipo de calificación inválido.'; end if;

  select * into v_b from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Reserva no encontrada.'; end if;

  -- b102: sin fecha de viaje no hay viaje que calificar; antes `travel_date is null`
  -- abría la calificación al momento de pagar.
  if not (v_b.status = 'paid' and v_b.travel_date is not null and v_b.travel_date <= current_date) then
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
end $function$;

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
        -- b102: solo con fecha de viaje ya pasada.
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
    'voucher_id', vch.id,
    -- b102: la calificación vive en el detalle del viaje, no en la lista.
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
  where b.id = p_booking_id and b.marketplace_customer_id = v_uid and b.status <> 'cancelled';
  return v;
end $function$;
