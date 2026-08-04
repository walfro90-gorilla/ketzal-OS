-- b048 — Reembolso PARCIAL ligado a un pago (C3 de docs/PLAN_CANCELACIONES.md).
-- Espejo de las migraciones aplicadas `ketzal_refund_partial` +
-- `ketzal_refund_partial_unique_guard` (consolidadas).
--
-- Contexto: el reembolso parcial "a nivel venta" YA existía
-- (register_payment type='refund', monto libre ≤ pagado neto, sin ligar).
-- Lo que faltaba: parcial LIGADO a un pago concreto (refunds_payment_id) —
-- necesario para la devolución parcial por Mercado Pago (API {amount}) y para
-- el rastro pago→devolución.
--
-- Decisión de diseño (la impuso el schema, hard-test): el ledger tiene el
-- unique `uq_payments_refund_of` ⇒ UN solo asiento refund ligado por pago.
-- El parcial respeta ese invariante: un pago admite UNA devolución ligada
-- (total vía refund_payment o parcial vía este RPC). Si hiciera falta
-- devolver más del mismo pago: refund a nivel venta (register_payment) sin
-- ligar + devolución en el panel de MP a mano. refund_payment queda INTACTO
-- (tras un parcial, su guard "ya fue reembolsado" bloquea el total — la UI
-- enruta el resto por el form manual).
--
-- INVOKER (la RLS de payments/bookings acota, calco de refund_payment).
-- Guards: monto > 0, ≤ el pago, ≤ pagado neto de la venta, pago COMPLETED
-- type='payment', sin devolución ligada previa. Recalcula status de la venta
-- (paid⇄reserved) igual que refund_payment.
--
-- Hard-test en vivo (fixtures QA e0480000-*, limpiadas, invariantes 0,
-- advisors 0 ERROR): parcial 1000 sobre pago 6000 ✓ (saldo revive), parcial
-- en venta pagada ⇒ paid→reserved ✓, monto > pago bloqueado, segundo ligado
-- bloqueado, refund_payment total tras parcial bloqueado, RLS cross-agencia
-- bloqueada.
--
-- App: `reembolsarPago(paymentId, amount?)` (aditivo) — amount < pago ⇒ MP
-- refund parcial {amount} (idempotency key con centavos) + este RPC; botón
-- "Parcial…" (window.prompt) en abonos; la celda distingue "Reembolsado" de
-- "Devuelto parcial $X".

create or replace function ketzal.refund_payment_partial(p_payment_id uuid, p_amount numeric)
returns numeric
language plpgsql
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_pay ketzal.payments;
  v_supplier uuid; v_total numeric; v_pagado numeric; v_balance numeric;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_pay from ketzal.payments where id = p_payment_id;  -- RLS: solo tus ventas
  if not found then raise exception 'Pago no encontrado o sin acceso'; end if;
  if v_pay.type <> 'payment' or v_pay.status <> 'COMPLETED' then
    raise exception 'Ese movimiento no es un pago reembolsable.'; end if;
  if v_monto > round(v_pay.amount_mxn, 2) then
    raise exception 'El reembolso (%) excede el pago (%).', v_monto, round(v_pay.amount_mxn, 2);
  end if;

  if exists (select 1 from ketzal.payments r where r.refunds_payment_id = p_payment_id) then
    raise exception 'Este pago ya tiene una devolución ligada.'; end if;

  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = v_pay.booking_id for update;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = v_pay.booking_id and status = 'COMPLETED';
  if v_monto > round(v_pagado, 2) then
    raise exception 'El reembolso (%) excede lo pagado (%).', v_monto, round(v_pagado, 2);
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, refunds_payment_id)
  values (v_pay.booking_id, v_supplier, v_uid, v_monto, 'COMPLETED', 'refund',
          v_pay.payment_method, now(), 1, 1, p_payment_id);

  select balance into v_balance from ketzal.bookings_with_balance where id = v_pay.booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status else status end
   where id = v_pay.booking_id and status <> 'cancelled';

  return v_monto;
end $$;

revoke all on function ketzal.refund_payment_partial(uuid, numeric) from public, anon;
grant execute on function ketzal.refund_payment_partial(uuid, numeric) to authenticated, service_role;
