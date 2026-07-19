-- 003 — `register_payment`: no recibir más de lo que se adeuda, ni reembolsar
--       más de lo que entró.
--
-- HALLAZGO (hard testing 2026-07-19, `supabase/tests/hard_testing_dinero.sql`):
--   caso 1 → abonar 50,000 sobre un saldo de 3,000 fue ACEPTADO. Saldo: −47,000.
--   caso 2 → reembolsar 9,000 habiendo recibido 500 fue ACEPTADO. Saldo: 11,500
--            sobre un viaje de 3,000 ⇒ el sistema afirmaba que el cliente debía
--            más de lo que costó el viaje. Dinero inventado.
-- La única validación de monto que existía era `if coalesce(p_amount,0) <= 0`.
--
-- POR QUÉ AQUÍ Y NO EN UN TRIGGER SOBRE `payments`:
-- Hay DOS caminos de escritura al ledger — `register_payment` (el agente) y
-- `confirm_online_payment` (el webhook de MP, que inserta directo). Un trigger
-- que bloqueara todo INSERT los cubriría a los dos, y por eso mismo estaría mal:
-- cuando el webhook corre, **el dinero YA se movió en Mercado Pago**. Rechazar
-- ese asiento deja dinero real sin registrar y al webhook devolviendo 500 en un
-- bucle de reintentos de MP. La regla correcta es asimétrica:
--   · antes de que el dinero se mueva  → prevenir  (create_payment_intent, register_payment)
--   · después de que el dinero se movió → registrar SIEMPRE (confirm_online_payment)
-- Un ledger que se niega a registrar dinero que existe deja de ser un ledger.
--
-- NOTA: `create_payment_intent` YA tenía exactamente esta guarda para el camino
-- en línea. Nunca se portó al camino manual. Se reusa su redacción para que el
-- agente vea el mismo mensaje sin importar por dónde cobre.

create or replace function ketzal.register_payment(
  p_booking_id uuid, p_amount numeric, p_method text,
  p_paid_at timestamp with time zone, p_type ketzal.payment_type)
 returns numeric
 language plpgsql
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_balance numeric; v_total numeric; v_pagado numeric;
  v_type ketzal.payment_type := coalesce(p_type, 'payment');
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  -- FOR UPDATE, no un SELECT normal: sin el candado de fila, dos abonos
  -- simultáneos leen el mismo saldo, ambos pasan la validación y juntos se pasan
  -- del total. La RLS se sigue aplicando (la función es invoker), así que una
  -- venta de otra agencia continúa siendo 'no encontrada'.
  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = p_booking_id for update;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;

  -- Mismo cálculo que la vista bookings_with_balance: pagos − reembolsos.
  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund'  then -amount_mxn
                           else 0 end), 0)
    into v_pagado
    from ketzal.payments
   where booking_id = p_booking_id and status = 'COMPLETED';

  if v_type = 'payment' then
    if v_monto > round(v_total - v_pagado, 2) then
      raise exception 'El monto (%) excede el saldo pendiente (%).',
        v_monto, round(v_total - v_pagado, 2);
    end if;
  elsif v_type = 'refund' then
    if v_monto > round(v_pagado, 2) then
      raise exception 'El reembolso (%) excede lo abonado (%).',
        v_monto, round(v_pagado, 2);
    end if;
  end if;
  -- Otros tipos pasan sin guarda a propósito: la vista del saldo también los
  -- ignora, así que no pueden mover el saldo. Si algún día cuentan, van arriba.

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment)
  values (p_booking_id, v_supplier, v_uid, v_monto, 'COMPLETED', v_type,
          nullif(trim(coalesce(p_method,'')),''), coalesce(p_paid_at, now()), 1, 1);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status else status end
   where id = p_booking_id and status <> 'cancelled';
  return v_balance;
end $function$;

-- Las ventas que el harness dejó en saldo negativo/inflado (casos 1 y 2) NO se
-- corrigen ni se borran: el ledger es append-only y son parte de la huella. Con
-- esta guarda puesta, cualquier abono nuevo sobre ellas queda bloqueado.
