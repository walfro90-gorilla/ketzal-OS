-- b027 — Portal del embajador: RPC de sus propias ganancias (scoped al que llama).
-- Espejo de la migración aplicada `b027_ambassador_earnings` (prod wnujoyzdpdyxblgdtxjw).
--
-- El embajador (profiles type='embajador') entra a /embajador y ve su devengado/
-- pagado/saldo + sus ventas atribuidas. DEFINER porque commission_lines/expenses no
-- exponen sus filas por RLS. Guard: solo el propio embajador. Sin PII del cliente
-- (solo servicio/fecha/estado/comisión).
create or replace function ketzal.my_ambassador_earnings()
returns jsonb language plpgsql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() <> 'embajador' then raise exception 'Solo para embajadores'; end if;

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
    from ketzal.expenses where category='embajador' and provider_profile_id = v_uid
  )
  select jsonb_build_object(
    'referral_code', (select referral_code from ketzal.profiles where id = v_uid),
    'devengado', (select devengado from earn),
    'pagado',    (select pagado from pag),
    'saldo',     (select devengado from earn) - (select pagado from pag),
    'num_ventas',(select count(*) filter (where kind='devengo') from dev),
    'ventas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'servicio', servicio, 'fecha', travel_date, 'status', status, 'comision', amount_mxn)
        order by created_at desc)
      from dev where kind='devengo'), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

revoke all on function ketzal.my_ambassador_earnings() from public, anon;
grant execute on function ketzal.my_ambassador_earnings() to authenticated, service_role;
