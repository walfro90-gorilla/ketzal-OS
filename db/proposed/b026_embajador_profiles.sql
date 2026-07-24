-- b026 — Refactor de identidad, Fase 2: embajador = profiles(type='embajador')
-- Espejo del estado aplicado (migraciones `b026_embajador_profiles` +
-- `b026_is_ambassador_fix`) en prod wnujoyzdpdyxblgdtxjw.
--
-- Mueve el PAYEE del embajador de `suppliers` a `profiles`. Re-toca el motor de
-- comisiones (b019–b023). Prod balance 0 (0 embajadores, 0 líneas) ⇒ migrable en
-- caliente. Plan: docs/REFACTOR_IDENTIDAD.md
--
-- Un embajador-profile REQUIERE fila en auth.users (profiles.id → auth.users ON
-- DELETE CASCADE), igual que un viajero ⇒ la alta va por service role +
-- admin.createUser en la app (crearEmbajador), NO por RPC SQL.
--
-- NO se tocan (verificado): tg_commission_snapshot / commissions_summary (solo usan
-- el payee_supplier_id de AGENCIA, que se conserva; sus inserts satisfacen el nuevo
-- shape CHECK), commission_amount, verificar_invariantes.

-- ============ 1. Columnas del payee-persona ============
alter table ketzal.commission_lines add column if not exists payee_profile_id  uuid references ketzal.profiles(id);
alter table ketzal.commission_rules add column if not exists scope_profile_id  uuid references ketzal.profiles(id);
alter table ketzal.expenses         add column if not exists provider_profile_id uuid references ketzal.profiles(id);

-- ============ 2. bookings.ambassador_id: suppliers → profiles ============
alter table ketzal.bookings drop constraint bookings_ambassador_id_fkey;
alter table ketzal.bookings add constraint bookings_ambassador_id_fkey
  foreign key (ambassador_id) references ketzal.profiles(id);

-- ============ 3. Invariantes de forma (exactamente un payee según el tipo) ============
alter table ketzal.commission_lines add constraint commission_lines_payee_shape_chk check (
     (payee_type = 'plataforma' and payee_supplier_id is null     and payee_profile_id is null)
  or (payee_type = 'agencia'    and payee_supplier_id is not null and payee_profile_id is null)
  or (payee_type = 'embajador'  and payee_profile_id  is not null and payee_supplier_id is null)
);
alter table ketzal.commission_rules drop constraint commission_rules_scope_chk;
alter table ketzal.commission_rules add constraint commission_rules_scope_chk check (
     (payee_type = 'plataforma' and scope_supplier_id is null     and scope_profile_id is null)
  or (payee_type = 'agencia'    and scope_supplier_id is not null and scope_profile_id is null)
  or (payee_type = 'embajador'  and scope_profile_id  is not null and scope_supplier_id is null)
);
alter table ketzal.expenses drop constraint expenses_mayorista_provider;
alter table ketzal.expenses add constraint expenses_mayorista_provider check (
     (category <> all (array['mayorista','embajador']))
  or (category = 'mayorista' and provider_supplier_id is not null)
  or (category = 'embajador' and provider_profile_id  is not null)
);

-- ============ 4. resolve_commission_rule: scope polimórfico (embajador=profile) ============
create or replace function ketzal.resolve_commission_rule(p_service uuid, p_payee_type text, p_scope uuid)
returns table(basis text, rate numeric, unit_amount numeric)
language plpgsql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_platform numeric;
begin
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type='embajador' then r.scope_profile_id else r.scope_supplier_id end) is not distinct from p_scope
      and r.service_id = p_service
    limit 1;
  if found then return; end if;
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type='embajador' then r.scope_profile_id else r.scope_supplier_id end) is not distinct from p_scope
      and r.service_id is null
    limit 1;
  if found then return; end if;
  if p_payee_type = 'plataforma' then
    select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
    return query select 'percent'::text, coalesce(v_platform,0)::numeric, null::numeric;
  elsif p_payee_type = 'agencia' then
    return query select 'percent'::text,
      coalesce((select commission_rate from ketzal.suppliers s where s.id = p_scope),0)::numeric, null::numeric;
  end if;
end $function$;

-- ============ 5. set_commission_rule: embajador escribe scope_profile_id ============
create or replace function ketzal.set_commission_rule(p_service uuid, p_payee_type text, p_scope uuid, p_basis text, p_rate numeric, p_unit numeric)
returns uuid language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_id uuid; v_scope_sup uuid; v_scope_prof uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_payee_type not in ('plataforma','agencia','embajador') then raise exception 'payee_type inválido'; end if;
  if not (ketzal.is_superadmin()
          or (p_payee_type = 'agencia' and ketzal.is_active()
              and p_scope is not null and p_scope = ketzal.my_supplier_id())) then
    raise exception 'Sin permiso para esta regla';
  end if;
  if p_payee_type = 'plataforma' and p_scope is not null then raise exception 'plataforma no lleva scope'; end if;
  if p_payee_type in ('agencia','embajador') and p_scope is null then raise exception 'esta regla requiere scope'; end if;
  if p_payee_type = 'embajador'
     and not exists (select 1 from ketzal.profiles p where p.id = p_scope and p.type = 'embajador') then
    raise exception 'Embajador no válido'; end if;

  v_scope_sup  := case when p_payee_type = 'embajador' then null else p_scope end;
  v_scope_prof := case when p_payee_type = 'embajador' then p_scope else null end;

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
  else
    raise exception 'basis inválido';
  end if;
  return v_id;
end $function$;

-- ============ 6. set_booking_ambassador: embajador=profile, payee_profile_id ============
create or replace function ketzal.set_booking_ambassador(p_booking uuid, p_ambassador uuid)
returns uuid language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
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
    raise exception 'Embajador no válido';
  end if;

  select id into v_id from ketzal.commission_lines
    where booking_id = p_booking and payee_type='embajador' and kind='devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = p_ambassador where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

  select * into r from ketzal.resolve_commission_rule(b.service_id, 'embajador', p_ambassador);
  if r.basis is null then raise exception 'Este embajador no tiene tarifa configurada para este servicio'; end if;
  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then raise exception 'La tarifa del embajador resultó en 0'; end if;

  select coalesce(sum(case when kind='devengo' then amount_mxn else -amount_mxn end),0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then
    raise exception 'La comisión del embajador (%) excede el saldo disponible de la venta (total % , ya comprometido %)',
      v_amt, b.total, v_sum;
  end if;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate, unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', p_ambassador, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = p_ambassador where id = p_booking;
  return v_id;
end $function$;

-- ============ 7. attribute_booking_by_ref: lookup por profiles.referral_code ============
create or replace function ketzal.attribute_booking_by_ref(p_booking uuid, p_ref text)
returns uuid language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid;
  b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
begin
  if v_uid is null then return null; end if;
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

  select id into v_amb from ketzal.profiles
   where referral_code = v_code and type = 'embajador';
  if v_amb is null then return null; end if;

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

  select id into v_id from ketzal.commission_lines
   where booking_id = p_booking and payee_type = 'embajador' and kind = 'devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = v_amb where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

  select * into r from ketzal.resolve_commission_rule(b.service_id, 'embajador', v_amb);
  if r.basis is null then return null; end if;
  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then return null; end if;

  select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then return null; end if;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate, unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', v_amb, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = v_amb where id = p_booking;
  return v_id;
end $function$;

-- ============ 8. ambassador_payables_summary: CxP por profile embajador ============
create or replace function ketzal.ambassador_payables_summary()
returns jsonb language plpgsql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then
    return jsonb_build_object('total_debo', 0, 'total_pagado', 0, 'total_saldo', 0, 'lista', '[]'::jsonb);
  end if;
  with dev as (
    select cl.payee_profile_id as emb_id,
           count(*) filter (where cl.kind = 'devengo') as num_ventas,
           coalesce(sum(case when cl.kind = 'devengo' then cl.amount_mxn else -cl.amount_mxn end), 0) as devengado
    from ketzal.commission_lines cl
    join ketzal.bookings b on b.id = cl.booking_id
    where cl.payee_type = 'embajador'
      and b.status in ('reserved', 'confirmed', 'paid')
    group by cl.payee_profile_id
  ),
  pag as (
    select provider_profile_id as emb_id,
           coalesce(sum(case when kind = 'egreso' then amount_mxn else -amount_mxn end), 0) as pagado
    from ketzal.expenses
    where category = 'embajador' and provider_profile_id is not null
    group by provider_profile_id
  ),
  merged as (
    select d.emb_id,
           (select name from ketzal.profiles s where s.id = d.emb_id) as embajador,
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

-- ============ 9. is_ambassador: helper DEFINER (create_expense es INVOKER y no
--    puede validar el profile del embajador bajo RLS) ============
create or replace function ketzal.is_ambassador(p_id uuid)
returns boolean language sql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
  select exists(select 1 from ketzal.profiles p where p.id = p_id and p.type = 'embajador');
$function$;

-- ============ 10. create_expense: firma intacta; embajador → provider_profile_id ============
-- p_provider_supplier_id transporta el id del proveedor en ambos casos (la UI manda
-- supplier para mayorista, profile para embajador); se enruta a la columna correcta.
create or replace function ketzal.create_expense(p_concept text, p_category text, p_amount numeric, p_method text, p_spent_at date, p_provider_supplier_id uuid DEFAULT NULL::uuid, p_booking_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
returns uuid language plpgsql set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

-- ============ 11. reverse_expense: copiar TAMBIÉN provider_profile_id ============
create or replace function ketzal.reverse_expense(p_expense_id uuid, p_reason text)
returns uuid language plpgsql set search_path to 'ketzal', 'pg_temp'
as $function$
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
end $function$;

-- ============ 12. list_ambassadors: catálogo de embajadores para la UI ============
-- profiles RLS = solo la fila propia ⇒ el admin no puede leerlos directo; va por
-- este DEFINER (superadmin). La ALTA de embajador NO es un RPC: requiere cuenta
-- auth (profiles.id → auth.users) ⇒ va por service role en la app (crearEmbajador).
create or replace function ketzal.list_ambassadors()
returns jsonb language plpgsql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'referral_code', referral_code) order by name), '[]'::jsonb)
    into v from ketzal.profiles where type = 'embajador';
  return v;
end $function$;

revoke all on function ketzal.is_ambassador(uuid)   from public, anon;
revoke all on function ketzal.list_ambassadors()    from public, anon;
grant execute on function ketzal.is_ambassador(uuid) to authenticated, service_role;
grant execute on function ketzal.list_ambassadors()  to authenticated, service_role;
