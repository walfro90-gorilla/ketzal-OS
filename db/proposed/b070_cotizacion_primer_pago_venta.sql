-- b070 — Cotización → primer abono ⇒ venta ('draft' → 'reserved').
-- Migración aplicada: `b070_cotizacion_primer_pago_venta` (2026-08-25).
--
-- PROBLEMA
-- El case de status de los RPCs de pago solo brincaba a 'paid' con saldo 0:
-- un abono PARCIAL sobre una cotización ('draft') dejaba el status intacto —
-- el dinero entraba al ledger pero la cotización nunca se volvía venta. Los
-- dos caminos de "venta con $0 cobrado" ("Guardar venta" en /ventas/nueva y
-- "Convertir a venta" en /cotizaciones) se quitan de la app en este mismo
-- carril: TODO nace cotización y el primer abono la asciende solo.
--
-- DECISIÓN (con el fundador)
-- Rama nueva `when status = 'draft' then 'reserved'` en el case de status,
-- aditiva, en los RPCs que registran movimientos de dinero:
--   · register_payment        (abono del agente)
--   · redeem_credit           (canje de crédito — su case vivo era de 2 ramas,
--                              sin 'paid'→'reserved'; solo se agrega la rama
--                              draft, no se "normaliza" nada más)
--   · refund_payment_partial  (rama incluida por consistencia; inalcanzable en
--                              la práctica: tras b070 un draft no puede cargar
--                              pagos COMPLETED)
-- confirm_online_payment NO se toca: su DDL vivo YA maneja draft→reserved con
-- bloque explícito y guard de cupo ('pagado_sin_cupo') desde la operación de
-- viaje (b034+).
--
-- NOTA sobre cupo: al ascender draft→reserved dentro de register_payment, el
-- trigger de capacidad corre en la MISMA transacción — si la salida está llena,
-- el abono completo se revierte (no se toma dinero para un camión lleno).
--
-- RE-APLICACIÓN ADITIVA desde el DDL vivo (leído 2026-08-25): cuerpos idénticos
-- salvo la rama nueva. Firmas, SECURITY (INVOKER/DEFINER) y search_path
-- intactos. CREATE OR REPLACE conserva los grants.
--
-- HARD-TEST (rollback garantizado vía RAISE dentro de un DO block, como
-- superadmin; cotización a medida de $1,000):
--   creada como 'draft'                          ✓
--   abono parcial $300  ⇒ status 'reserved'      ✓
--   completar saldo $700 ⇒ status 'paid'         ✓
--   refund parcial $200 sobre 'paid' ⇒ 'reserved' ✓
--   abono sobre 'cancelled' ⇒ sigue 'cancelled'  ✓
--   residuo 0 · verificar_invariantes()=0 · advisors security 0 ERROR

-- 1/3 register_payment (INVOKER — la RLS por agencia acota)
CREATE OR REPLACE FUNCTION ketzal.register_payment(p_booking_id uuid, p_amount numeric, p_method text, p_paid_at timestamp with time zone, p_type ketzal.payment_type)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_balance numeric; v_total numeric; v_pagado numeric;
  v_type ketzal.payment_type := coalesce(p_type, 'payment');
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select selling_supplier_id, total into v_supplier, v_total
    from ketzal.bookings where id = p_booking_id for update;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;

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

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment)
  values (p_booking_id, v_supplier, v_uid, v_monto, 'COMPLETED', v_type,
          nullif(trim(coalesce(p_method,'')),''), coalesce(p_paid_at, now()), 1, 1);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'paid' then 'reserved'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = p_booking_id and status <> 'cancelled';
  return v_balance;
end $function$;

-- 2/3 redeem_credit (DEFINER — guards propios; case vivo de 2 ramas + la nueva)
CREATE OR REPLACE FUNCTION ketzal.redeem_credit(p_credit uuid, p_booking uuid, p_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_c ketzal.credits;
  v_b ketzal.bookings;
  v_titular uuid;
  v_persona_venta uuid;
  v_canjeado numeric; v_saldo_credito numeric; v_pagado numeric; v_saldo_venta numeric; v_balance numeric;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_c from ketzal.credits where id = p_credit;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if current_date >= v_c.expires_at then
    raise exception 'El crédito expiró el %.', v_c.expires_at; end if;

  select marketplace_customer_id into v_titular from ketzal.customers where id = v_c.customer_id;

  -- Legitimación del lado del CRÉDITO: superadmin, la agencia EMISORA, o el
  -- propio titular (el viajero aplicándolo desde su cuenta). Sin esto, la
  -- agencia destino podía consumir sola el crédito emitido por otra.
  if not (ketzal.is_superadmin()
          or coalesce(v_c.supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_titular = v_uid, false)) then
    raise exception 'Solo el titular del crédito o la agencia que lo emitió pueden aplicarlo.';
  end if;

  select * into v_b from ketzal.bookings where id = p_booking for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_b.marketplace_customer_id = v_uid, false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta está cancelada.'; end if;

  -- Misma PERSONA: mismo customer, o identidad marketplace compartida.
  if v_b.customer_id is distinct from v_c.customer_id then
    select marketplace_customer_id into v_persona_venta from ketzal.customers where id = v_b.customer_id;
    if v_titular is null or v_persona_venta is null
       or v_titular is distinct from v_persona_venta then
      raise exception 'El crédito es de otro cliente.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_credit::text, 42));
  select coalesce(sum(amount_mxn), 0) into v_canjeado
    from ketzal.payments where credit_id = p_credit and status = 'COMPLETED';
  v_saldo_credito := round(v_c.amount_mxn - v_canjeado, 2);
  if v_monto > v_saldo_credito then
    raise exception 'El monto (%) excede el saldo del crédito (%).', v_monto, v_saldo_credito;
  end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = p_booking and status = 'COMPLETED';
  v_saldo_venta := round(v_b.total - v_pagado, 2);
  if v_monto > v_saldo_venta then
    raise exception 'El monto (%) excede el saldo de la venta (%).', v_monto, v_saldo_venta;
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, credit_id)
  values (p_booking, v_b.selling_supplier_id, v_uid, v_monto, 'COMPLETED', 'payment',
          'credito', now(), 1, 1, p_credit);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = p_booking and status <> 'cancelled';

  return round(v_saldo_credito - v_monto, 2);
end $function$;

-- 3/3 refund_payment_partial (INVOKER)
CREATE OR REPLACE FUNCTION ketzal.refund_payment_partial(p_payment_id uuid, p_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
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
  if v_pay.payment_method = 'credito' then
    raise exception 'Un abono pagado con crédito no se devuelve en efectivo.'; end if;
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
                       when status = 'paid' then 'reserved'::ketzal.booking_status
                       when status = 'draft' then 'reserved'::ketzal.booking_status
                       else status end
   where id = v_pay.booking_id and status <> 'cancelled';

  return v_monto;
end $function$;
