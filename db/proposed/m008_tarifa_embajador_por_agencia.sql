-- m008 · La tarifa de embajador la fija la AGENCIA DUEÑA del viaje
--
-- Cambio de modelo respecto a m005 (y a la primera versión de ADR-0021), pedido
-- por el fundador al revisar el flujo:
--
--   · Ketzal recluta embajadores DIRECTOS, sin agencia (`supplier_id` null).
--   · Cualquier embajador puede vender viajes de CUALQUIER agencia. No hay
--     límite por agencia: el que trae la venta, cobra.
--   · Paga la agencia dueña del viaje... pero paga LO QUE ELLA FIJÓ, no lo que
--     traiga el embajador.
--
-- Ese último punto es el que obliga a mover la tarifa. En m005 la tarifa vivía
-- pegada al embajador (`scope_profile_id`), una sola y global: si el embajador
-- de Ketzal traía 10% y Border pagaba 3% a los suyos, Border acababa pagando un
-- 10% que nunca acordó. Con agencias terceras en el SaaS eso es una factura
-- sorpresa y un problema contractual.
--
-- Ahora la tarifa de embajadores es de la AGENCIA:
--   (payee_type='embajador', scope_supplier_id=<agencia>, scope_profile_id=null)
--     = "lo que esta agencia paga a CUALQUIER embajador que le traiga venta"
--   (payee_type='embajador', scope_profile_id=<embajador>)
--     = override para un embajador concreto (se conserva de m005; gana sobre
--       la de agencia, y sirve para el trato especial de un embajador estrella)
--
-- `commission_rules_scope_chk` prohibía que un embajador llevara
-- `scope_supplier_id`, así que hay que relajarlo. Se re-escribe desde el DDL
-- vivo conservando las ramas de plataforma, agencia y agente intactas.

-- 1) El check acepta la tarifa de embajadores por agencia ───────────────────
alter table ketzal.commission_rules drop constraint if exists commission_rules_scope_chk;
alter table ketzal.commission_rules add constraint commission_rules_scope_chk check (
  (payee_type = 'plataforma' and scope_supplier_id is null and scope_profile_id is null)
  or (payee_type = 'agencia'  and scope_supplier_id is not null and scope_profile_id is null)
  or (payee_type = 'agente'   and scope_profile_id is not null and scope_supplier_id is null)
  -- Embajador: por agencia (la tarifa general de esa agencia) o por persona
  -- (override), nunca las dos a la vez ni ninguna.
  or (payee_type = 'embajador'
      and (scope_supplier_id is not null) <> (scope_profile_id is not null))
);

-- 2) resolve_commission_rule: para embajador, la agencia del viaje manda ────
-- Se agrega el parámetro `p_supplier` (la agencia dueña de la venta). El orden
-- de resolución para embajador queda: override del embajador para ESE servicio
-- → override del embajador general → tarifa de la agencia para ESE servicio →
-- tarifa general de la agencia → nada (y entonces no se devenga).
-- La firma pasa de 3 a 4 argumentos. `create or replace` crearía una SOBRECARGA
-- y las llamadas existentes con 3 args quedarían ambiguas ⇒ se dropea primero.
-- Los 5 llamadores (attribute_booking_by_ref, set_booking_ambassador,
-- tg_commission_snapshot, platform_fee_for_payment,
-- tg_require_commission_to_publish) resuelven en runtime por ser plpgsql, y
-- siguen funcionando con 3 args gracias al default.
drop function if exists ketzal.resolve_commission_rule(uuid, text, uuid);

create or replace function ketzal.resolve_commission_rule(
  p_service uuid, p_payee_type text, p_scope uuid, p_supplier uuid default null
)
returns table(basis text, rate numeric, unit_amount numeric)
language plpgsql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare v_platform numeric;
begin
  if p_payee_type = 'embajador' then
    -- Override por embajador (primero con servicio, luego general).
    return query
      select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
       where r.active and r.payee_type = 'embajador'
         -- `is not null` explícito: con un p_scope nulo, `is not distinct from`
         -- casaría con las reglas DE AGENCIA (que llevan scope_profile_id null)
         -- y le aplicaría a nadie la tarifa de alguien.
         and r.scope_profile_id is not null
         and r.scope_profile_id = p_scope
         and r.service_id = p_service
       limit 1;
    if found then return; end if;
    return query
      select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
       where r.active and r.payee_type = 'embajador'
         and r.scope_profile_id is not null
         and r.scope_profile_id = p_scope
         and r.service_id is null
       limit 1;
    if found then return; end if;
    -- Tarifa de la agencia dueña del viaje (es quien paga).
    if p_supplier is not null then
      return query
        select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
         where r.active and r.payee_type = 'embajador'
           and r.scope_supplier_id = p_supplier
           and r.service_id = p_service
         limit 1;
      if found then return; end if;
      return query
        select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
         where r.active and r.payee_type = 'embajador'
           and r.scope_supplier_id = p_supplier
           and r.service_id is null
         limit 1;
    end if;
    return;
  end if;

  -- Resto de payees: comportamiento original de b019/b054, intacto.
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type = 'agente' then r.scope_profile_id else r.scope_supplier_id end)
          is not distinct from p_scope
      and r.service_id = p_service
    limit 1;
  if found then return; end if;
  return query
    select r.basis, r.rate, r.unit_amount from ketzal.commission_rules r
    where r.active and r.payee_type = p_payee_type
      and (case when p_payee_type = 'agente' then r.scope_profile_id else r.scope_supplier_id end)
          is not distinct from p_scope
      and r.service_id is null
    limit 1;
  if found then return; end if;
  if p_payee_type = 'plataforma' then
    select platform_commission_rate into v_platform from ketzal.app_settings where id = 1;
    return query select 'percent'::text, coalesce(v_platform,0)::numeric, null::numeric;
  elsif p_payee_type = 'agencia' then
    return query select 'percent'::text,
      coalesce((select commission_rate from ketzal.suppliers s where s.id = p_scope),0)::numeric,
      null::numeric;
  end if;
end $$;

-- 3) Bitácora de referidos que NO devengaron ────────────────────────────────
-- Antes `attribute_booking_by_ref` devolvía null en silencio: el embajador
-- traía la venta, no cobraba, y nadie podía decirle por qué. Append-only y
-- RPC-only-write, como toda tabla que el motor escribe.
create table if not exists ketzal.referral_misses (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references ketzal.bookings(id) on delete cascade,
  ref_code     text not null,
  ambassador_id uuid references ketzal.profiles(id),
  supplier_id  uuid references ketzal.suppliers(id),
  reason       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists referral_misses_amb_idx on ketzal.referral_misses (ambassador_id);

alter table ketzal.referral_misses enable row level security;

drop policy if exists referral_misses_sel on ketzal.referral_misses;
create policy referral_misses_sel on ketzal.referral_misses for select to authenticated
  using (
    ketzal.is_superadmin()
    or (supplier_id is not null and coalesce(ketzal.is_agency_admin(supplier_id), false))
    or ambassador_id = auth.uid()   -- el interesado ve por qué no cobró
  );

revoke all on ketzal.referral_misses from anon;
grant select on ketzal.referral_misses to authenticated;
revoke insert, update, delete, truncate on ketzal.referral_misses from authenticated, anon;

-- 4) attribute_booking_by_ref: sin límite de agencia + deja rastro del fallo ─
create or replace function ketzal.attribute_booking_by_ref(p_booking uuid, p_ref text)
returns uuid
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid;
  b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
begin
  if v_uid is null then return null; end if;
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then return null; end if;

  -- Mismo gate de siempre: quién puede atribuir esta venta.
  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    return null;
  end if;

  select id into v_amb from ketzal.profiles
   where referral_code = v_code and type = 'embajador';
  if v_amb is null then
    insert into ketzal.referral_misses (booking_id, ref_code, supplier_id, reason)
    values (p_booking, v_code, b.selling_supplier_id, 'codigo_inexistente');
    return null;
  end if;

  -- Idempotencia: si ya hay devengo, solo sella el ambassador_id.
  select id into v_id from ketzal.commission_lines
   where booking_id = p_booking and payee_type = 'embajador' and kind = 'devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = v_amb where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

  -- La tarifa la pone la agencia DUEÑA del viaje (o el override del embajador).
  select * into r from ketzal.resolve_commission_rule(
    b.service_id, 'embajador', v_amb, b.selling_supplier_id);
  if r.basis is null then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'sin_tarifa_de_la_agencia');
    return null;
  end if;

  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'tarifa_da_cero');
    return null;
  end if;

  select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'comisiones_exceden_la_venta');
    return null;
  end if;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate,
                                      unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', v_amb, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = v_amb where id = p_booking;
  return v_id;
end $$;

-- 5) Policies: la tarifa de embajadores de MI agencia la fijo yo ────────────
-- Se re-escriben desde el DDL vivo sumando la rama `scope_supplier_id`.
drop policy if exists commission_rules_sel on ketzal.commission_rules;
create policy commission_rules_sel on ketzal.commission_rules for select
  using (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador' and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
    or (scope_profile_id is not null and scope_profile_id = auth.uid())
    -- Todo embajador necesita leer las tarifas de agencia: son las que le
    -- pagan, y su portal las muestra para que sepa cuánto gana en cada una.
    or (payee_type = 'embajador' and scope_supplier_id is not null
        and coalesce(ketzal.is_ambassador(auth.uid()), false))
  );

drop policy if exists commission_rules_ins on ketzal.commission_rules;
create policy commission_rules_ins on ketzal.commission_rules for insert
  with check (
    ketzal.is_superadmin()
    or (payee_type = 'agencia' and scope_supplier_id = ketzal.my_supplier_id()
        and ketzal.is_active())
    or (payee_type = 'embajador' and scope_supplier_id = ketzal.my_supplier_id()
        and ketzal.is_active())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false)
        and ketzal.is_active())
  );

drop policy if exists commission_rules_upd on ketzal.commission_rules;
create policy commission_rules_upd on ketzal.commission_rules for update
  using (
    ketzal.is_superadmin()
    or (payee_type in ('agencia','embajador') and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  )
  with check (
    ketzal.is_superadmin()
    or (payee_type in ('agencia','embajador') and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  );

drop policy if exists commission_rules_del on ketzal.commission_rules;
create policy commission_rules_del on ketzal.commission_rules for delete
  using (
    ketzal.is_superadmin()
    or (payee_type in ('agencia','embajador') and scope_supplier_id = ketzal.my_supplier_id())
    or (payee_type = 'embajador'
        and coalesce(ketzal.is_admin_de_embajador(scope_profile_id), false))
  );

-- 6) La atribución MANUAL usa la misma tarifa que la automática ─────────────
-- Si no, el admin que asigna un embajador a mano seguiría buscando solo el
-- override por persona y fallaría con "no tiene tarifa configurada" aunque su
-- agencia sí la tenga puesta.
create or replace function ketzal.set_booking_ambassador(p_booking uuid, p_ambassador uuid)
returns uuid
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare v_uid uuid := auth.uid(); b ketzal.bookings; r record;
        v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
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

  select * into r from ketzal.resolve_commission_rule(
    b.service_id, 'embajador', p_ambassador, b.selling_supplier_id);
  if r.basis is null then
    raise exception 'Ni el embajador ni la agencia dueña del viaje tienen tarifa de embajador configurada';
  end if;
  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then raise exception 'La tarifa del embajador resultó en 0'; end if;

  select coalesce(sum(case when kind='devengo' then amount_mxn else -amount_mxn end),0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then
    raise exception 'La comisión del embajador (%) excede el saldo disponible de la venta (total %, ya comprometido %)',
      v_amt, b.total, v_sum;
  end if;

  insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis, rate,
                                      unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', p_ambassador, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = p_ambassador where id = p_booking;
  return v_id;
end $$;
