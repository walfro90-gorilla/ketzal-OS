-- b073 — Cancelar una venta reversa su comisión devengada.
--
-- Hueco encontrado en la auditoría: ni cancel_booking ni cancel_booking_v2
-- tocaban commission_lines, y de las 8 funciones que escriben esa tabla NINGUNA
-- insertaba kind='reverso' — el valor existía en el CHECK y en el trigger de
-- ledger, pero no había UN SOLO camino en la BD que lo escribiera (el reverso
-- del hard-test de b054 se hizo a mano). Consecuencia: un pedido del portal que
-- devengó y luego se cancela dejaba el devengo y su asiento vivos ⇒ la agencia
-- seguía debiendo la comisión de una venta que ya no existe.
--
-- Fix: cancel_booking_v2 inserta un contra-asiento (kind='reverso') por cada
-- línea devengada. NO se hace UPDATE/DELETE (ledger append-only, ADR-0006); el
-- trigger tg_ledger_mirror_commission ya espeja el reverso con signo invertido.
-- Idempotente por `reverses_line_id`. Re-apply aditivo desde el DDL vivo: único
-- cambio vs la versión viva = el bloque de reverso antes del return.

create or replace function ketzal.cancel_booking_v2(p_booking uuid, p_reason text, p_mode text, p_waive_fee boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b ketzal.bookings;
  v_prev jsonb;
  v_pol jsonb;
  v_pena numeric := 0;
  v_pagado numeric := 0;
  v_credit_id uuid;
  v_monto_credito numeric;
  v_vig int;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if p_mode not in ('efectivo', 'credito') then raise exception 'Modo inválido'; end if;

  select * into v_b from ketzal.bookings where id = p_booking for update;
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta ya está cancelada'; end if;
  if p_waive_fee and v_reason is null then
    raise exception 'Condonar la pena requiere motivo (cancelación de la agencia / fuerza mayor).';
  end if;

  v_prev := ketzal.preview_cancellation(p_booking);
  v_pagado := coalesce((v_prev->>'pagado_mxn')::numeric, 0);
  v_pena := case when p_waive_fee or p_mode = 'credito' then 0
                 else coalesce((v_prev->>'pena_mxn')::numeric, 0) end;

  if p_mode = 'credito' and v_pagado > 0 then
    if v_b.selling_supplier_id is null then
      raise exception 'El crédito requiere una venta de agencia (agente libre: usa efectivo).';
    end if;
    if v_b.customer_id is null then
      raise exception 'La venta no tiene cliente para emitir el crédito.';
    end if;
    v_pol := coalesce(v_b.cancellation_policy,
                      ketzal.effective_cancellation_policy(v_b.selling_supplier_id));
    v_vig := least(120, greatest(1, coalesce((v_pol->'credito'->>'vigencia_meses')::int, 12)));
    v_monto_credito := least(v_pagado, round(v_pagado * least(100, greatest(0,
                         coalesce((v_pol->'credito'->>'pct')::numeric, 100))) / 100, 2));

    insert into ketzal.credits(supplier_id, customer_id, booking_origen_id, amount_mxn,
                               expires_at, note, created_by)
    values (v_b.selling_supplier_id, v_b.customer_id, p_booking, v_monto_credito,
            (current_date + make_interval(months => v_vig))::date, v_reason, v_uid)
    returning id into v_credit_id;

    insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                                payment_method, paid_at, installments, current_installment)
    values (p_booking, v_b.selling_supplier_id, v_uid, v_pagado, 'COMPLETED', 'refund',
            'credito', now(), 1, 1);
  end if;

  update ketzal.bookings
     set status = 'cancelled',
         cancel_reason = v_reason,
         cancel_fee_mxn = v_pena,
         cancelled_at = now(),
         updated_at = now()
   where id = p_booking;

  -- b073: contra-asiento de cada comisión devengada. Idempotente (una línea de
  -- reverso por línea de devengo sin reversar). tg_ledger_mirror_commission
  -- espeja el reverso con signo invertido. Ledger append-only: nunca UPDATE/DELETE.
  insert into ketzal.commission_lines(booking_id, payee_type, payee_supplier_id, payee_profile_id,
                                      basis, rate, unit_amount, num_pax, amount_mxn, kind, reverses_line_id)
  select cl.booking_id, cl.payee_type, cl.payee_supplier_id, cl.payee_profile_id,
         cl.basis, cl.rate, cl.unit_amount, cl.num_pax, cl.amount_mxn, 'reverso', cl.id
  from ketzal.commission_lines cl
  where cl.booking_id = p_booking and cl.kind = 'devengo'
    and not exists (select 1 from ketzal.commission_lines r where r.reverses_line_id = cl.id);

  return jsonb_build_object(
    'pena_mxn', v_pena,
    'pagado_mxn', v_pagado,
    'a_devolver_mxn', case when p_mode = 'efectivo' then greatest(0, v_pagado - v_pena) else 0 end,
    'credito_id', v_credit_id,
    'credito_mxn', v_monto_credito);
end $function$;
