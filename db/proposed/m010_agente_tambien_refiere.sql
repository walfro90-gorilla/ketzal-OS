-- m010 — un agente también puede referir (y cobrar por ello)
--
-- `profiles.type` estaba haciendo dos trabajos a la vez: decidir DÓNDE entras
-- (el OS o el portal `/embajador`) y decidir SI COBRAS por referir. Como es un
-- solo valor, un agente de mostrador que compartía el link del marketplace no
-- cobraba nada: `attribute_booking_by_ref` filtraba literal por
-- `type = 'embajador'`, así que su código caía en `referral_misses` con razón
-- `codigo_inexistente` y nadie se enteraba.
--
-- Aquí se separan las dos cosas. El acceso lo sigue decidiendo `type`; el cobro
-- pasa a decidirlo tener `referral_code` + tarifa. La línea que se emite sigue
-- siendo `payee_type='embajador'` a propósito: es una comisión POR REFERIR, sin
-- importar el oficio de quien refirió — así la tarifa por agencia de m008, el
-- ledger, `/embajador` y los reportes siguen funcionando sin tocarse.
--
-- El riesgo obvio que abre esto es el AUTO-REFERIDO: el agente se pasa su
-- propio link, cierra él mismo la venta y cobra dos veces (línea 'agente' por
-- `sold_by` + línea 'embajador' por `ambassador_id`). Se bloquea abajo con su
-- propia razón en `referral_misses`, para que quede el rastro en vez de
-- desaparecer en silencio.

begin;

-- === 1) El código resuelve a embajador O a agente ==========================
-- Re-aplicada desde el DDL vivo (m008), no desde una copia vieja.
create or replace function ketzal.attribute_booking_by_ref(p_booking uuid, p_ref text)
returns uuid
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid;
  b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
begin
  if v_uid is null then return null; end if;
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

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

  -- m010: antes `and type = 'embajador'`. Un agente con código también refiere.
  select id into v_amb from ketzal.profiles
   where referral_code = v_code and type in ('embajador', 'agente');
  if v_amb is null then
    insert into ketzal.referral_misses (booking_id, ref_code, supplier_id, reason)
    values (p_booking, v_code, b.selling_supplier_id, 'codigo_inexistente');
    return null;
  end if;

  -- m010: dado de baja ⇒ deja de cobrar, pero con SU razón. Meterlo en el
  -- `where` de arriba habría dicho 'codigo_inexistente', que manda a buscar un
  -- código mal escrito cuando el problema es otro.
  if not exists (select 1 from ketzal.profiles p where p.id = v_amb and p.active) then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'perfil_inactivo');
    return null;
  end if;

  -- m010: auto-referido. Quien cerró la venta no cobra ADEMÁS por referirla:
  -- ya cobra su línea de 'agente' por `sold_by`. Sin este guard, pasarse el
  -- propio link es una forma de duplicarse la comisión.
  if b.sold_by is not null and b.sold_by = v_amb then
    insert into ketzal.referral_misses (booking_id, ref_code, ambassador_id, supplier_id, reason)
    values (p_booking, v_code, v_amb, b.selling_supplier_id, 'auto_referido');
    return null;
  end if;

  select id into v_id from ketzal.commission_lines
   where booking_id = p_booking and payee_type = 'embajador' and kind = 'devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = v_amb where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

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
end $function$;

-- === 2) El agente con código ve lo que ganó por referir =====================
-- Mismo cuerpo; solo deja de exigir type='embajador'. Sin esto el agente
-- referiría, cobraría en el ledger y no tendría dónde verlo — el mismo hueco
-- que m005 cerró para los embajadores.
create or replace function ketzal.my_ambassador_earnings()
returns jsonb
language plpgsql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if ketzal.my_profile_type() not in ('embajador', 'agente') then
    raise exception 'Solo para quien puede referir';
  end if;

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

-- === 3) El admin asigna el código a un agente suyo =========================
-- `profiles` es RPC-only-write (ADR-0006): la escritura va por función, nunca
-- por PATCH de PostgREST. Mismo gate que `set_commission_rule` para 'agente':
-- admin activo de LA MISMA agencia, o superadmin.
create or replace function ketzal.set_referral_code(p_profile uuid, p_code text)
returns text
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_profile is null then raise exception 'Falta el perfil'; end if;

  if not (
    ketzal.is_superadmin()
    or (ketzal.is_active() and exists (
          select 1 from ketzal.profiles me
          join ketzal.profiles target on target.id = p_profile
          where me.id = v_uid and me.role = 'admin' and me.supplier_id is not null
            and me.supplier_id = target.supplier_id))
  ) then
    raise exception 'Sin permiso para asignar el código de este perfil';
  end if;

  -- Solo quien puede referir. Un viajero con código no significaría nada.
  if not exists (select 1 from ketzal.profiles p
                  where p.id = p_profile and p.type in ('embajador','agente')) then
    raise exception 'Solo un agente o un embajador puede tener código de referido';
  end if;

  v_code := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '');
  -- Mismo formato que valida la app: 3–32, letras/números/guion/guion bajo.
  if v_code is not null and v_code !~ '^[A-Z0-9_-]{3,32}$' then
    raise exception 'El código debe tener 3–32 caracteres: letras, números, guion o guion bajo';
  end if;

  -- `profiles.referral_code` es UNIQUE. Sin este catch el choque sale como
  -- "23505 duplicate key ... profiles_referral_code_key", que no le dice nada
  -- a quien está tecleando un código en la pantalla.
  begin
    update ketzal.profiles set referral_code = v_code where id = p_profile;
  exception when unique_violation then
    raise exception 'Ese código ya está en uso por otra persona';
  end;
  return v_code;
end $function$;

revoke all on function ketzal.set_referral_code(uuid, text) from public, anon;
grant execute on function ketzal.set_referral_code(uuid, text) to authenticated;

-- === 4) La lista de agentes trae su código (para pintarlo en /comisiones) ===
drop function if exists ketzal.list_agents_for_commission(uuid);
create or replace function ketzal.list_agents_for_commission(p_supplier uuid default null)
returns table(id uuid, name text, basis text, rate numeric, unit_amount numeric,
              referral_code text)
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
    select p.id, coalesce(p.name, 'Agente') as name, r.basis, r.rate, r.unit_amount,
           p.referral_code
    from ketzal.profiles p
    left join ketzal.commission_rules r
      on r.payee_type = 'agente' and r.scope_profile_id = p.id
      and r.service_id is null and r.active
    where p.type = 'agente' and p.supplier_id = v_supplier and p.active
    order by name;
end $function$;

revoke all on function ketzal.list_agents_for_commission(uuid) from public, anon;
grant execute on function ketzal.list_agents_for_commission(uuid) to authenticated;

commit;
