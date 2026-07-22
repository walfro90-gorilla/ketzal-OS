-- 014 — list_my_marketplace_orders: + next_due_date (recordatorio de abono, #7).
--
-- Aditivo: agrega la FECHA del próximo abono impago (mismo criterio que next_due:
-- primer tramo del payment_schedule cuyo acumulado supera lo pagado). El UI del
-- viajero lo usa para el recordatorio con urgencia (vencido / hoy / en N días).
-- No cambia ningún campo existente. [[persona]] viajero.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create or replace function ketzal.list_my_marketplace_orders()
 returns jsonb language plpgsql stable security definer
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
        coalesce(sv.name, 'Viaje') as service_name,
        bwb.total, bwb.paid, bwb.balance,
        case
          when bwb.balance <= 0 then 0
          when b.payment_type = 'abonos' then coalesce((
            select least(bwb.balance, x.cum - bwb.paid)
            from (
              select ps.seq, sum(ps.amount) over (order by ps.seq) as cum
              from ketzal.payment_schedule ps where ps.booking_id = b.id
            ) x
            where x.cum > bwb.paid
            order by x.seq limit 1
          ), bwb.balance)
          else bwb.balance
        end as next_due,
        case
          when bwb.balance > 0 and b.payment_type = 'abonos' then (
            select y.due_date
            from (
              select ps.seq, ps.due_date, sum(ps.amount) over (order by ps.seq) as cum
              from ketzal.payment_schedule ps where ps.booking_id = b.id
            ) y
            where y.cum > bwb.paid
            order by y.seq limit 1
          )
          else null
        end as next_due_date,
        (b.status = 'paid' and (b.travel_date is null or b.travel_date <= current_date)) as can_rate,
        exists(select 1 from ketzal.ratings r
               where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as rated_provider,
        exists(select 1 from ketzal.ratings r
               where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as rated_app
      from ketzal.bookings b
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.services sv on sv.id = b.service_id
      where b.marketplace_customer_id = v_uid and b.status <> 'cancelled'
    ) o
  );
end $function$;
