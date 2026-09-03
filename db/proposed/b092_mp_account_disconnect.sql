-- b092 — Desconectar la cuenta de Mercado Pago de una agencia. (ADR-0042)
--
-- Migración aplicada: `b092_mp_account_disconnect` (2026-09-03).
--
-- Problema: `mp_accounts` es deny-all (solo service_role) y la única puerta era
-- el OAuth (b053) + Reconectar (ADR-0024), que hace UPSERT. No había forma de
-- que una agencia quedara SIN cuenta: si se conectó la cuenta equivocada (pasó
-- el 2026-09-03: Border quedó ligada al MP user de Wanderlust), el split seguía
-- mandando su dinero a esa cuenta hasta reconectar con la correcta.
--
-- `mp_account_disconnect(p_supplier)` borra la copia de Ketzal (tokens incluidos)
-- con el MISMO guard que `mp_account_status`: superadmin o admin activo de esa
-- agencia, `coalesce(...,false)` (regla de oro 1). Devuelve true si había fila,
-- false si no (idempotente). Deja rastro en `system_log` (quién, qué agencia,
-- qué MP user) para que una desconexión sea verificable después.
--
-- NO revoca nada del lado de Mercado Pago: los tokens ya emitidos siguen
-- vivos hasta expirar (ADR-0024). La revocación es del vendedor, en su cuenta
-- de MP → Aplicaciones autorizadas; la UI lo dice con esas palabras.

create or replace function ketzal.mp_account_disconnect(p_supplier uuid)
returns boolean
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_mp  text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not coalesce(ketzal.is_superadmin(), false)
     and not coalesce(ketzal.is_agency_admin(p_supplier), false) then
    raise exception 'Sin acceso.';
  end if;

  delete from ketzal.mp_accounts where supplier_id = p_supplier
    returning mp_user_id into v_mp;
  if v_mp is null then return false; end if;

  insert into ketzal.system_log(source, level, event, detail)
    values ('mp_oauth', 'info', 'desconectada',
            jsonb_build_object('supplier_id', p_supplier, 'mp_user_id', v_mp, 'by', v_uid));
  return true;
end $$;

revoke all on function ketzal.mp_account_disconnect(uuid) from public, anon;
grant execute on function ketzal.mp_account_disconnect(uuid) to authenticated, service_role;
