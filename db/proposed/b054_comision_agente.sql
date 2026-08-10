-- b054: comisión por agente individual (perfil, no agencia agregada), base
-- 'hibrido' (% + fijo por pasajero). Aditivo sobre el motor de comisiones
-- (b019+) y el ledger balance-0 (b052): agrega el payee/account_type 'agente'
-- y la basis 'hibrido' donde ya existían plataforma/agencia/embajador y
-- percent/fijo_venta/fijo_pax. Nada existente cambia de comportamiento.

begin;

-- === commission_lines ===
alter table ketzal.commission_lines drop constraint commission_lines_basis_check;
alter table ketzal.commission_lines add constraint commission_lines_basis_check
  check (basis = any (array['percent','fijo_venta','fijo_pax','hibrido']));

alter table ketzal.commission_lines drop constraint commission_lines_payee_type_check;
alter table ketzal.commission_lines add constraint commission_lines_payee_type_check
  check (payee_type = any (array['plataforma','agencia','embajador','agente']));

alter table ketzal.commission_lines drop constraint commission_lines_payee_shape_chk;
alter table ketzal.commission_lines add constraint commission_lines_payee_shape_chk
  check (
    (payee_type = 'plataforma' and payee_supplier_id is null and payee_profile_id is null)
    or (payee_type = 'agencia' and payee_supplier_id is not null and payee_profile_id is null)
    or (payee_type = any(array['embajador','agente']) and payee_profile_id is not null and payee_supplier_id is null)
  );

-- === commission_rules ===
alter table ketzal.commission_rules drop constraint commission_rules_basis_check;
alter table ketzal.commission_rules add constraint commission_rules_basis_check
  check (basis = any (array['percent','fijo_venta','fijo_pax','hibrido']));

alter table ketzal.commission_rules drop constraint commission_rules_payee_type_check;
alter table ketzal.commission_rules add constraint commission_rules_payee_type_check
  check (payee_type = any (array['plataforma','agencia','embajador','agente']));

alter table ketzal.commission_rules drop constraint commission_rules_scope_chk;
alter table ketzal.commission_rules add constraint commission_rules_scope_chk
  check (
    (payee_type = 'plataforma' and scope_supplier_id is null and scope_profile_id is null)
    or (payee_type = 'agencia' and scope_supplier_id is not null and scope_profile_id is null)
    or (payee_type = any(array['embajador','agente']) and scope_profile_id is not null and scope_supplier_id is null)
  );

alter table ketzal.commission_rules drop constraint commission_rules_value_chk;
alter table ketzal.commission_rules add constraint commission_rules_value_chk
  check (
    (basis = 'percent' and rate is not null and unit_amount is null)
    or (basis = any(array['fijo_venta','fijo_pax']) and unit_amount is not null and rate is null)
    or (basis = 'hibrido' and rate is not null and unit_amount is not null)
  );

-- === ledger_entries ===
alter table ketzal.ledger_entries drop constraint ledger_entries_account_type_check;
alter table ketzal.ledger_entries add constraint ledger_entries_account_type_check
  check (account_type = any (array['plataforma','agencia','embajador','viajero','agente']));

alter table ketzal.ledger_entries drop constraint ledger_account_shape_chk;
alter table ketzal.ledger_entries add constraint ledger_account_shape_chk
  check (
    (account_type = 'plataforma' and account_supplier_id is null and account_profile_id is null)
    or (account_type = 'agencia' and account_supplier_id is not null and account_profile_id is null)
    or (account_type = any(array['embajador','viajero','agente']) and account_profile_id is not null and account_supplier_id is null)
  );

-- === commission_amount: + basis 'hibrido' (percent + fijo_pax combinados) ===
create or replace function ketzal.commission_amount(p_basis text, p_rate numeric, p_unit numeric, p_num_pax integer, p_total numeric)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case p_basis
    when 'percent'    then round(coalesce(p_total,0) * coalesce(p_rate,0) / 100.0, 2)
    when 'fijo_pax'   then round(coalesce(p_unit,0) * coalesce(p_num_pax,0), 2)
    when 'fijo_venta' then round(coalesce(p_unit,0), 2)
    when 'hibrido'    then round(coalesce(p_total,0) * coalesce(p_rate,0) / 100.0, 2)
                          + round(coalesce(p_unit,0) * coalesce(p_num_pax,0), 2)
    else 0 end;
$function$;

-- === resolve_commission_rule: 'agente' resuelve por scope_profile_id (calco embajador) ===
create or replace function ketzal.resolve_commission_rule(p_service uuid, p_payee_type text, p_scope uuid)
returns table(basis text, rate numeric, unit_amount numeric)
language plpgsql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_platform numeric;
begin
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type in ('embajador','agente') then r.scope_profile_id else r.scope_supplier_id end) is not distinct from p_scope
      and r.service_id = p_service
    limit 1;
  if found then return; end if;
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type in ('embajador','agente') then r.scope_profile_id else r.scope_supplier_id end) is not distinct from p_scope
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

-- === set_commission_rule: + payee_type 'agente' + basis 'hibrido' ===
create or replace function ketzal.set_commission_rule(p_service uuid, p_payee_type text, p_scope uuid, p_basis text, p_rate numeric, p_unit numeric)
returns uuid
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_id uuid; v_scope_sup uuid; v_scope_prof uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_payee_type not in ('plataforma','agencia','embajador','agente') then raise exception 'payee_type inválido'; end if;
  if not (
    ketzal.is_superadmin()
    or (p_payee_type = 'agencia' and ketzal.is_active()
        and p_scope is not null and p_scope = ketzal.my_supplier_id())
    or (p_payee_type = 'agente' and ketzal.is_active()
        and p_scope is not null
        and exists (
          select 1 from ketzal.profiles me
          join ketzal.profiles target on target.id = p_scope
          where me.id = v_uid and me.role = 'admin' and me.supplier_id is not null
            and me.supplier_id = target.supplier_id
        ))
  ) then
    raise exception 'Sin permiso para esta regla';
  end if;
  if p_payee_type = 'plataforma' and p_scope is not null then raise exception 'plataforma no lleva scope'; end if;
  if p_payee_type in ('agencia','embajador','agente') and p_scope is null then raise exception 'esta regla requiere scope'; end if;
  if p_payee_type = 'embajador'
     and not exists (select 1 from ketzal.profiles p where p.id = p_scope and p.type = 'embajador') then
    raise exception 'Embajador no válido'; end if;
  if p_payee_type = 'agente'
     and not exists (select 1 from ketzal.profiles p where p.id = p_scope and p.type = 'agente') then
    raise exception 'Agente no válido'; end if;

  v_scope_sup  := case when p_payee_type in ('embajador','agente') then null else p_scope end;
  v_scope_prof := case when p_payee_type in ('embajador','agente') then p_scope else null end;

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
  elsif p_basis = 'hibrido' then
    if p_rate is null or p_rate < 0 or p_rate > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
    if p_unit is null or p_unit < 0 then raise exception 'El monto por pasajero debe ser mayor o igual a cero'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, scope_profile_id, basis, rate, unit_amount)
      values (p_service, p_payee_type, v_scope_sup, v_scope_prof, 'hibrido', round(p_rate,2), round(p_unit,2)) returning id into v_id;
  else
    raise exception 'basis inválido';
  end if;
  return v_id;
end $function$;

-- === tg_commission_snapshot: + bloque 'agente' (por bookings.sold_by) ===
create or replace function ketzal.tg_commission_snapshot()
returns trigger
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare r record; v_amt numeric(12,2); v_is_mkt boolean;
begin
  if NEW.status not in ('reserved','confirmed','paid') then return NEW; end if;
  v_is_mkt := NEW.marketplace_customer_id is not null;

  if (NEW.selling_supplier_id is null or v_is_mkt)
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
  -- Opt-in: sin tarifa configurada para ESE agente, resolve_commission_rule
  -- regresa basis null y no se inserta nada (igual que embajador).
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

-- === tg_ledger_mirror_commission: explícito por tipo (el 'else' ya no puede
--     asumir embajador ahora que hay 4 payee_type) ===
create or replace function ketzal.tg_ledger_mirror_commission()
returns trigger
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_selling uuid;
  v_sign numeric := case when new.kind = 'reverso' then -1 else 1 end;
  v_payee jsonb;
begin
  select selling_supplier_id into v_selling from ketzal.bookings where id = new.booking_id;
  if v_selling is null or new.amount_mxn = 0 then return new; end if;

  v_payee := case new.payee_type
    when 'plataforma' then jsonb_build_object('account_type','plataforma')
    when 'agencia'    then jsonb_build_object('account_type','agencia','account_supplier_id', new.payee_supplier_id)
    when 'embajador'  then jsonb_build_object('account_type','embajador','account_profile_id', new.payee_profile_id)
    when 'agente'     then jsonb_build_object('account_type','agente','account_profile_id', new.payee_profile_id)
  end;
  -- payee_type ya está acotado por el CHECK de la tabla a estos 4 valores;
  -- si algún día se agrega uno nuevo sin actualizar este CASE, v_payee sale
  -- null y ledger_post revienta al construir el jsonb (falla ruidoso, no silencioso).

  if new.payee_type = 'agencia' and new.payee_supplier_id = v_selling then return new; end if;

  perform ketzal.ledger_post(jsonb_build_array(
    v_payee || jsonb_build_object(
      'kind', new.kind, 'amount_mxn', v_sign * new.amount_mxn,
      'booking_id', new.booking_id, 'commission_line_id', new.id,
      'note', 'Comisión ' || new.payee_type),
    jsonb_build_object(
      'account_type','agencia','account_supplier_id', v_selling,
      'kind', new.kind, 'amount_mxn', -1 * v_sign * new.amount_mxn,
      'booking_id', new.booking_id, 'commission_line_id', new.id,
      'note', 'Comisión ' || new.payee_type || ' (a cargo)')
  ));
  return new;
end $function$;

-- === ledger_statement: + 'agente' junto a embajador/viajero (self-view) ===
create or replace function ketzal.ledger_statement(p_account_type text, p_supplier uuid default null, p_profile uuid default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
  v_admin boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_admin := exists (select 1 from ketzal.profiles p
                     where p.id = v_uid and p.role = 'admin' and p.active);
  if not v_super then
    if p_account_type = 'agencia' then
      if not (v_admin and p_supplier = v_supplier) then
        raise exception 'Sin acceso a esa cuenta.';
      end if;
    elsif p_account_type in ('embajador','viajero','agente') then
      if p_profile is distinct from v_uid then
        raise exception 'Sin acceso a esa cuenta.';
      end if;
    else
      raise exception 'Sin acceso a esa cuenta.';
    end if;
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
    from (
      select le.id, le.kind, le.amount_mxn, le.note, le.booking_id,
             le.available_at, le.created_at
      from ketzal.ledger_entries le
      where le.account_type = p_account_type
        and (p_account_type <> 'agencia' or le.account_supplier_id = p_supplier)
        and (p_account_type not in ('embajador','viajero','agente') or le.account_profile_id = p_profile)
      order by le.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) m
  );
end $function$;

-- === settle_ledger: + 'agente' en la lista blanca ===
create or replace function ketzal.settle_ledger(p_account_type text, p_supplier uuid default null, p_profile uuid default null, p_amount numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_saldo numeric;
  v_amount numeric(12,2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_superadmin() then
    raise exception 'Solo el superadmin liquida cuentas.';
  end if;
  if p_account_type not in ('agencia','embajador','viajero','agente') then
    raise exception 'Cuenta inválida.';
  end if;

  select coalesce(sum(amount_mxn), 0) into v_saldo
  from ketzal.ledger_entries
  where account_type = p_account_type
    and (account_supplier_id = p_supplier or account_supplier_id is null and p_supplier is null)
    and (account_profile_id = p_profile or account_profile_id is null and p_profile is null);

  v_amount := round(coalesce(p_amount, abs(v_saldo)), 2);
  if v_amount <= 0 then raise exception 'Nada que liquidar (saldo %).', v_saldo; end if;
  if v_amount > abs(v_saldo) + 0.005 then
    raise exception 'El monto (%) excede el saldo (%).', v_amount, v_saldo;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object('account_type', p_account_type,
      'account_supplier_id', p_supplier, 'account_profile_id', p_profile,
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then -v_amount else v_amount end,
      'note', coalesce(p_note, 'Liquidación')),
    jsonb_build_object('account_type', 'plataforma',
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then v_amount else -v_amount end,
      'note', coalesce(p_note, 'Liquidación'))
  ));
  return jsonb_build_object('ok', true, 'liquidado', v_amount, 'saldo_previo', v_saldo);
end $function$;

commit;

-- RPC nuevo (fuera de la transacción anterior: hace su propio DROP+CREATE
-- porque cambia el shape de OUT params): lista los agentes (type='agente')
-- de la agencia del caller (o de cualquiera si superadmin+scope) CON su
-- tarifa vigente (si tiene), para el selector + prefill del form de tarifa.
-- RLS de commission_rules NO deja leer payee_type='agente' directo (solo
-- 'agencia' con scope propio o superadmin) — de ahí el LEFT JOIN dentro del
-- DEFINER en vez de 2 queries desde el cliente.
drop function if exists ketzal.list_agents_for_commission(uuid);
create function ketzal.list_agents_for_commission(p_supplier uuid default null)
returns table(id uuid, name text, basis text, rate numeric, unit_amount numeric)
language plpgsql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_supplier uuid;
begin
  if not ketzal.is_active() then raise exception 'Cuenta pendiente de aprobación.'; end if;
  if ketzal.is_superadmin() then
    v_supplier := coalesce(p_supplier, ketzal.my_supplier_id());
  else
    if not exists (select 1 from ketzal.profiles me where me.id = auth.uid() and me.role = 'admin') then
      raise exception 'Sin permiso.';
    end if;
    v_supplier := ketzal.my_supplier_id();
  end if;
  if v_supplier is null then return; end if;
  return query
    select p.id, coalesce(p.name, 'Agente') as name, r.basis, r.rate, r.unit_amount
    from ketzal.profiles p
    left join ketzal.commission_rules r
      on r.payee_type = 'agente' and r.scope_profile_id = p.id
      and r.service_id is null and r.active
    where p.type = 'agente' and p.supplier_id = v_supplier and p.active
    order by name;
end $function$;

revoke all on function ketzal.list_agents_for_commission(uuid) from public, anon;
grant execute on function ketzal.list_agents_for_commission(uuid) to authenticated, service_role;
