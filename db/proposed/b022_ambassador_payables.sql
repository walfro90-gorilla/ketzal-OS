-- b022 — CxP a embajadores: la deuda de Ketzal con sus embajadores.
--
-- CONTEXTO. Cuando un embajador vende (por `?ref` o atribución manual) se estampa
-- su `commission_lines` (payee_type='embajador') = el DEVENGO. Eso genera la deuda
-- de KETZAL (plataforma) con el embajador. El pago la baja: gasto
-- `category='embajador'` con `provider_supplier_id` = el embajador (ledger de F2).
--   saldo = devengado − pagado.
--
-- Calco de `payables_summary` (CxP mayorista) pero el que paga es KETZAL, no una
-- agencia ⇒ este resumen es SOLO superadmin. Solo cuentan ventas reales
-- (status reserved/confirmed/paid); un draft/cancelado no genera deuda.
--
-- Además: un pago a embajador EXIGE el proveedor (para netear la CxP), igual que
-- mayorista. Se extiende el CHECK de la tabla (backstop en la BD).

-- 1. El CHECK de proveedor cubre también 'embajador'.
alter table ketzal.expenses drop constraint if exists expenses_mayorista_provider;
alter table ketzal.expenses add  constraint expenses_mayorista_provider
  check (category not in ('mayorista','embajador') or provider_supplier_id is not null);

-- 2. Resumen de CxP a embajadores (DEFINER, superadmin).
create or replace function ketzal.ambassador_payables_summary()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then
    return jsonb_build_object('total_debo', 0, 'total_pagado', 0, 'total_saldo', 0, 'lista', '[]'::jsonb);
  end if;

  with dev as (
    select cl.payee_supplier_id as emb_id,
           count(*) filter (where cl.kind = 'devengo') as num_ventas,
           coalesce(sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end), 0) as devengado
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.payee_type = 'embajador'
      and b.status in ('reserved', 'confirmed', 'paid')
    group by cl.payee_supplier_id
  ),
  pag as (
    select provider_supplier_id as emb_id,
           coalesce(sum(case when kind = 'egreso' then amount_mxn else -amount_mxn end), 0) as pagado
    from ketzal.expenses
    where category = 'embajador' and provider_supplier_id is not null
    group by provider_supplier_id
  ),
  merged as (
    select d.emb_id,
           (select name from ketzal.suppliers s where s.id = d.emb_id) as embajador,
           d.num_ventas, d.devengado,
           coalesce(p.pagado, 0) as pagado,
           d.devengado - coalesce(p.pagado, 0) as saldo
    from dev d left join pag p on p.emb_id = d.emb_id
  )
  select jsonb_build_object(
    'total_debo', coalesce(sum(devengado), 0),
    'total_pagado', coalesce(sum(pagado), 0),
    'total_saldo', coalesce(sum(saldo), 0),
    'lista', coalesce(jsonb_agg(jsonb_build_object(
      'embajador_id', emb_id, 'embajador', embajador, 'num_ventas', num_ventas,
      'devengado', devengado, 'pagado', pagado, 'saldo', saldo) order by saldo desc), '[]'::jsonb)
  ) into v from merged;
  return v;
end $function$;
revoke all on function ketzal.ambassador_payables_summary() from public, anon;
grant execute on function ketzal.ambassador_payables_summary() to authenticated;

-- 3. create_expense (F2) re-aplicado ADITIVO desde el DDL vivo: acepta
--    category='embajador' y le exige proveedor igual que 'mayorista'.
--    COORDINACIÓN: RPC compartido de F2 — si el otro agente lo re-aplica,
--    conservar 'embajador' en la lista y en el guard de proveedor.
create or replace function ketzal.create_expense(
  p_concept text, p_category text, p_amount numeric, p_method text, p_spent_at date,
  p_provider_supplier_id uuid default null, p_booking_id uuid default null, p_notes text default null)
 returns uuid
 language plpgsql
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_sup uuid := ketzal.my_supplier_id();
        v_amount numeric(12,2) := round(p_amount, 2); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación por un administrador.'; end if;
  if coalesce(trim(p_concept),'') = '' then raise exception 'Falta el concepto del gasto'; end if;
  if p_category not in ('operacion','transporte','hospedaje','alimentos','mayorista','embajador','marketing','otro')
    then raise exception 'Categoría inválida'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_category in ('mayorista','embajador') and p_provider_supplier_id is null
    then raise exception 'Un pago a % requiere el proveedor', p_category; end if;
  insert into ketzal.expenses(supplier_id, created_by, kind, concept, category, amount_mxn,
    method, spent_at, provider_supplier_id, booking_id, notes)
  values (v_sup, v_uid, 'egreso', trim(p_concept), p_category, v_amount,
    nullif(trim(coalesce(p_method,'')),''), coalesce(p_spent_at, current_date),
    p_provider_supplier_id, p_booking_id, nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end $function$;
