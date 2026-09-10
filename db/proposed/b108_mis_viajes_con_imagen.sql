-- b108 — La tarjeta de Mis viajes trae la imagen del servicio.
--
-- Migración aplicada: `b108_mis_viajes_con_imagen` (2026-09-09).
--
-- La tarjeta de la lista era un pedido (nombre, estado, total). Para que sea
-- un viaje hace falta su portada: `service_image` = banner del servicio o la
-- primera foto del álbum. Re-aplicado desde el DDL vivo (b105); solo cambia la
-- línea marcada "b108".

CREATE OR REPLACE FUNCTION ketzal.list_my_marketplace_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
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
        -- b108: portada del servicio (banner, o la primera del álbum) para la tarjeta.
        coalesce(sv.images->>'imgBanner', sv.images->'imgAlbum'->>0) as service_image,
        bwb.total, bwb.paid, bwb.balance,
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
      where b.marketplace_customer_id = v_uid
        and not (b.status = 'cancelled'
                 and not exists (select 1 from ketzal.payments p
                                  where p.booking_id = b.id and p.status = 'COMPLETED'))
    ) o
  );
end $function$
;
