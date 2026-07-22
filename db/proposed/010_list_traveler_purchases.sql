-- 010 — list_traveler_purchases(p_id): compras de un viajero (para el god admin).
--
-- Indexa los bookings ligados a un comprador B2C (bookings.marketplace_customer_id)
-- con su info general + dinero derivado. Money math en la BD (regla de oro #2):
-- cobrado = Σ(payment − refund) sobre pagos COMPLETED; saldo = total − cobrado.
--
-- SECURITY DEFINER + estrictamente superadmin (igual que list_travelers).
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create or replace function ketzal.list_traveler_purchases(p_id uuid) returns jsonb
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
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
    'created_at',  b.created_at
  ) order by b.created_at desc), '[]'::jsonb) into v
  from ketzal.bookings b
  cross join lateral (
    select coalesce(sum(case when p.type = 'payment' then p.amount_mxn
                             when p.type = 'refund'  then -p.amount_mxn
                             else 0 end), 0) as cobrado
    from ketzal.payments p
    where p.booking_id = b.id and p.status = 'COMPLETED'
  ) c
  where b.marketplace_customer_id = p_id;

  return v;
end $$;

revoke all on function ketzal.list_traveler_purchases(uuid) from public;
grant execute on function ketzal.list_traveler_purchases(uuid) to authenticated;
