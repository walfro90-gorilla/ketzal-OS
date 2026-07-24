-- b020 — set_commission_rule: alta/edición/limpieza atómica de una regla de comisión.
--
-- CONTEXTO. b019 dejó la tabla ketzal.commission_rules con RLS de escritura, pero
-- el "upsert" (una sola regla activa por (payee_type,scope,service)) es
-- deactivate-actual + insert-nueva. Hacerlo en 2 llamadas desde el cliente no es
-- atómico y el índice único parcial `where active` friccciona. Esta RPC lo hace
-- en una transacción, con el MISMO guard que las policies (superadmin, o la
-- agencia dueña para reglas 'agencia'). Sirve a los 3 payee_type; la UI de Fase 2
-- la usa hoy solo para 'plataforma' (cuánto gana Ketzal por servicio).
--
-- p_basis null ⇒ limpiar (volver al comportamiento por defecto: % global / legacy).

create or replace function ketzal.set_commission_rule(
  p_service uuid, p_payee_type text, p_scope uuid,
  p_basis text, p_rate numeric, p_unit numeric)
 returns uuid
 language plpgsql security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_payee_type not in ('plataforma','agencia','embajador') then
    raise exception 'payee_type inválido'; end if;
  -- guard = calco de las policies de commission_rules
  if not (ketzal.is_superadmin()
          or (p_payee_type = 'agencia' and ketzal.is_active()
              and p_scope is not null and p_scope = ketzal.my_supplier_id())) then
    raise exception 'Sin permiso para esta regla';
  end if;
  -- coherencia scope↔payee (calco del CHECK de la tabla)
  if p_payee_type = 'plataforma' and p_scope is not null then raise exception 'plataforma no lleva scope'; end if;
  if p_payee_type in ('agencia','embajador') and p_scope is null then raise exception 'esta regla requiere scope'; end if;

  -- desactiva la regla activa que ocupa el slot (payee_type, scope, service)
  update ketzal.commission_rules set active = false
   where active and payee_type = p_payee_type
     and scope_supplier_id is not distinct from p_scope
     and service_id is not distinct from p_service;

  if p_basis is null then return null; end if;  -- limpiar

  if p_basis = 'percent' then
    if p_rate is null or p_rate < 0 or p_rate > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, basis, rate)
      values (p_service, p_payee_type, p_scope, 'percent', round(p_rate,2)) returning id into v_id;
  elsif p_basis in ('fijo_venta','fijo_pax') then
    if p_unit is null or p_unit <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
    insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, basis, unit_amount)
      values (p_service, p_payee_type, p_scope, p_basis, round(p_unit,2)) returning id into v_id;
  else
    raise exception 'basis inválido';
  end if;
  return v_id;
end $function$;
revoke all on function ketzal.set_commission_rule(uuid,text,uuid,text,numeric,numeric) from public, anon;
grant execute on function ketzal.set_commission_rule(uuid,text,uuid,text,numeric,numeric) to authenticated;
