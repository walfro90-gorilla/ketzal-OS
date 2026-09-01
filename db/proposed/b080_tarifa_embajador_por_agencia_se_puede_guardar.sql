-- b080 — La tarifa de embajador POR AGENCIA por fin se puede guardar.
-- Espejo de la migración aplicada `b080_tarifa_embajador_por_agencia_se_puede_guardar`.
--
-- ── El hueco ───────────────────────────────────────────────────────────────
--
-- m008 movió la tarifa de embajadores a la AGENCIA dueña del viaje (ADR-0021:
-- "paga quien recluta" pasó a "paga la agencia dueña, con la tarifa que ella
-- fijó"). Actualizó el LECTOR (`resolve_commission_rule`, que ahora busca
-- perfil+servicio → perfil+global → agencia+servicio → agencia+global) y el
-- CHECK de la tabla, que acepta las dos formas de scope.
--
-- Pero NO actualizó el ESCRITOR. `set_commission_rule` tenía:
--
--     v_scope_sup := case when p_payee_type in ('embajador','agente')
--                         then null else p_scope end;
--
-- o sea: para embajador SIEMPRE guardaba `scope_profile_id` y jamás
-- `scope_supplier_id`. La tarifa que el resolver busca por agencia —la que de
-- verdad paga— no se podía crear desde ninguna parte de la app.
--
-- Por eso el programa de embajadores llevaba desde su creación con CERO reglas
-- de `payee_type='embajador'` en producción: un embajador podía traer la venta
-- y cobrar $0, y nadie entendía por qué. El síntoma se veía en `/comisiones`
-- como "Sin tarifa (no atribuye)" en todos lados, sin forma de arreglarlo.
--
-- ── La decisión ────────────────────────────────────────────────────────────
--
-- El scope de una tarifa de embajador se distingue POR LO QUE ES: si el uuid es
-- una agencia, la regla es de agencia; si es un profile type='embajador', es el
-- trato especial de esa persona. Un uuid no puede ser las dos cosas, así que no
-- hace falta cambiar la firma del RPC (contrato compartido) ni pasar una bandera.
--
-- Y el ADMIN DE AGENCIA puede fijar la suya. Sin eso cada agencia dependía del
-- fundador para poder pagarle a quien le trae ventas — justo la dependencia que
-- m005 y m008 querían quitar de en medio. El guard usa `is_agency_admin(p_scope)`
-- con `coalesce(...,false)` (regla de oro #1).
--
-- Se re-aplica ADITIVAMENTE desde el DDL vivo: los caminos de plataforma,
-- agencia y agente quedan idénticos.

create or replace function ketzal.set_commission_rule(p_service uuid, p_payee_type text, p_scope uuid, p_basis text, p_rate numeric, p_unit numeric)
 returns uuid
 language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_id uuid; v_scope_sup uuid; v_scope_prof uuid;
        v_es_agencia boolean := false;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_payee_type not in ('plataforma','agencia','embajador','agente') then raise exception 'payee_type inválido'; end if;
  if p_payee_type = 'plataforma' and p_scope is not null then raise exception 'plataforma no lleva scope'; end if;
  if p_payee_type in ('agencia','embajador','agente') and p_scope is null then raise exception 'esta regla requiere scope'; end if;

  -- b080: la tarifa de EMBAJADOR puede ser de una AGENCIA (la general que esa
  -- agencia paga a quien le traiga viajeros, m008/ADR-0021) o de una PERSONA
  -- (el trato especial que gana sobre todas). Se distingue por lo que sea el
  -- scope: un uuid no puede ser agencia y embajador a la vez.
  if p_payee_type = 'embajador' then
    if exists (select 1 from ketzal.suppliers s
                where s.id = p_scope and s.supplier_type = 'agency') then
      v_es_agencia := true;
    elsif not exists (select 1 from ketzal.profiles p
                       where p.id = p_scope and p.type = 'embajador') then
      raise exception 'El scope de una tarifa de embajador debe ser una agencia o un embajador';
    end if;
  end if;

  if not (
    ketzal.is_superadmin()
    or (p_payee_type = 'agencia' and ketzal.is_active()
        and p_scope is not null and p_scope = ketzal.my_supplier_id())
    -- b080: el admin fija la tarifa de embajadores DE SU AGENCIA. Sin esto, cada
    -- agencia dependía del fundador para poder pagarle a quien le trae ventas,
    -- que es justo lo que m005/m008 quisieron quitar de en medio.
    or (p_payee_type = 'embajador' and v_es_agencia and ketzal.is_active()
        and coalesce(ketzal.is_agency_admin(p_scope), false))
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

  if p_payee_type = 'agente'
     and not exists (select 1 from ketzal.profiles p where p.id = p_scope and p.type = 'agente') then
    raise exception 'Agente no válido'; end if;

  v_scope_sup  := case
                    when p_payee_type = 'embajador' and v_es_agencia then p_scope
                    when p_payee_type in ('embajador','agente') then null
                    else p_scope end;
  v_scope_prof := case
                    when p_payee_type = 'embajador' and v_es_agencia then null
                    when p_payee_type in ('embajador','agente') then p_scope
                    else null end;

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

revoke all on function ketzal.set_commission_rule(uuid, text, uuid, text, numeric, numeric) from public, anon;
grant execute on function ketzal.set_commission_rule(uuid, text, uuid, text, numeric, numeric) to authenticated, service_role;
