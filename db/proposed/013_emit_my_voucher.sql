-- 013 — emit_my_voucher(p_booking_id): emisión del voucher por el PROPIO comprador.
--
-- #35 dejó emit_voucher (INVOKER) gateado al agente que maneja la venta; un
-- comprador B2C (sin profile) no pasa su RLS. Para las compras en línea (sin
-- agente en el flujo) el viajero necesita su voucher: este RPC lo emite con
-- ownership por marketplace_customer_id = auth.uid(), DEFINER, reusando la MISMA
-- tabla vouchers + next_doc_folio + la página pública get_voucher_public.
-- Idempotente (1 por venta), solo reserved/confirmed/paid. [[persona]] viajero.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

create or replace function ketzal.emit_my_voucher(p_booking_id uuid) returns uuid
  language plpgsql security definer
  set search_path to 'ketzal', 'pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_supplier uuid; v_status ketzal.booking_status; v_folio bigint;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  -- ownership: la venta es del propio comprador
  select selling_supplier_id, status into v_supplier, v_status
    from ketzal.bookings where id = p_booking_id and marketplace_customer_id = v_uid;
  if not found then raise exception 'Viaje no encontrado'; end if;
  -- idempotente
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id;
  if found then return v_id; end if;
  if v_status not in ('reserved','confirmed','paid') then
    raise exception 'El voucher está disponible cuando tu compra está apartada o pagada.';
  end if;
  v_folio := ketzal.next_doc_folio(coalesce(v_supplier, v_uid), 'voucher');
  insert into ketzal.vouchers(booking_id, supplier_id, folio, created_by)
    values (p_booking_id, v_supplier, v_folio, v_uid)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from ketzal.vouchers where booking_id = p_booking_id; return v_id;
end $$;
revoke all on function ketzal.emit_my_voucher(uuid) from public, anon;
grant execute on function ketzal.emit_my_voucher(uuid) to authenticated;
