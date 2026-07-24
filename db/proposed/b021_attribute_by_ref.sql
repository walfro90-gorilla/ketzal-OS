-- b021 — attribute_booking_by_ref: atribución del embajador por código (?ref).
--
-- CONTEXTO. El comprador del marketplace llega por un link de embajador
-- (`/servicio/[id]?ref=CODIGO`). Tras crear el pedido, la app resuelve el código
-- y estampa la línea del embajador. El comprador (marketplace_customer) NO puede
-- leer `suppliers` (RLS) ni insertar en `commission_lines` (REVOKE) ⇒ hace falta
-- este RPC DEFINER.
--
-- BEST-EFFORT: la atribución JAMÁS rompe la compra. Código inexistente, sin
-- tarifa para el servicio, venta ajena o comisión que excede el total ⇒ no-op
-- (return null), nunca raise. Es un clon tolerante de set_booking_ambassador
-- (que sí raise, para dar feedback en la UI del OS); reusa resolve_commission_rule
-- y commission_amount. Idempotente por la línea de embajador.

create or replace function ketzal.attribute_booking_by_ref(p_booking uuid, p_ref text)
 returns uuid
 language plpgsql security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid(); v_code text; v_amb uuid;
  b ketzal.bookings; r record; v_amt numeric(12,2); v_sum numeric(12,2); v_id uuid;
begin
  if v_uid is null then return null; end if;
  -- normaliza el código igual que el form del embajador (mayúsculas, sin espacios)
  v_code := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  if v_code = '' then return null; end if;

  select id into v_amb from ketzal.suppliers
   where referral_code = v_code and supplier_type = 'embajador';
  if v_amb is null then return null; end if;  -- código no existe

  select * into b from ketzal.bookings where id = p_booking;
  if b.id is null then return null; end if;

  -- guard NULL-safe: comprador dueño de su venta, vendedor, agencia operadora o superadmin.
  if not coalesce(
       ketzal.is_superadmin()
       or b.sold_by = v_uid
       or (b.selling_supplier_id is not null and b.selling_supplier_id = ketzal.my_supplier_id())
       or (b.marketplace_customer_id is not null and b.marketplace_customer_id = v_uid),
     false) then
    return null;  -- no atribuye a ventas ajenas (silencioso, sin fuga)
  end if;

  -- idempotente: si ya hay línea de embajador, solo asegura la etiqueta.
  select id into v_id from ketzal.commission_lines
   where booking_id = p_booking and payee_type = 'embajador' and kind = 'devengo' limit 1;
  if v_id is not null then
    update ketzal.bookings set ambassador_id = v_amb where id = p_booking and ambassador_id is null;
    return v_id;
  end if;

  select * into r from ketzal.resolve_commission_rule(b.service_id, 'embajador', v_amb);
  if r.basis is null then return null; end if;  -- sin tarifa para este servicio → skip
  v_amt := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, b.num_pax, b.total);
  if v_amt <= 0 then return null; end if;

  select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
    into v_sum from ketzal.commission_lines where booking_id = p_booking;
  if v_sum + v_amt > b.total then return null; end if;  -- excede el total → skip

  insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, basis, rate, unit_amount, num_pax, amount_mxn)
  values (p_booking, 'embajador', v_amb, r.basis, r.rate, r.unit_amount, b.num_pax, v_amt)
  returning id into v_id;
  update ketzal.bookings set ambassador_id = v_amb where id = p_booking;
  return v_id;
end $function$;
revoke all on function ketzal.attribute_booking_by_ref(uuid,text) from public, anon;
grant execute on function ketzal.attribute_booking_by_ref(uuid,text) to authenticated, service_role;
