-- b050 — Cancelar con política (C4 del plan de cancelaciones). Espejo de la
-- migración aplicada `ketzal_cancel_booking_v2`.
--
-- El flujo deja de ser "status + motivo" (cancel_booking v1, que queda para
-- compat): calcula la pena del tramo REUSANDO preview_cancellation (fuente
-- única de la fórmula pena = max(tramo% × total, enganche), b047), registra
-- pena + fecha en la venta, y en modo crédito emite el crédito ATÓMICO en la
-- misma transacción (fila en credits b049 + asiento refund método 'credito'
-- por lo pagado ⇒ la venta queda saldada sin salida de efectivo).
--
--  · p_mode: 'credito' (pena 0, emite crédito por pagado × pct de la política)
--            | 'efectivo' (registra pena; NO reembolsa — devolver es acto
--            aparte y consciente vía refund_payment/refund_payment_partial).
--  · p_waive_fee: cancelación imputable a la agencia / fuerza mayor ⇒ pena 0,
--    motivo OBLIGATORIO (espejo NOM: cuando cancela la agencia no se retiene).
--  · INVOKER: la RLS de bookings acota (el insert a credits pasa por
--    credits_ins de la agencia vendedora). Agente libre (selling null) no
--    puede emitir crédito (credits.supplier_id NOT NULL) ⇒ efectivo.
--  · El cupo se libera solo (trigger de capacidad existente en el cambio de
--    status, igual que v1).
--
-- Hard-test en vivo (fixtures QA e0500000-*, limpiadas, invariantes 0,
-- advisors 0 ERROR): cancel crédito ⇒ fee 0 + refund 'credito' + credits row
-- (+12m); cancel efectivo a 10 días ⇒ fee 50%; waive ⇒ fee 0; waive sin
-- motivo bloqueado; doble cancel bloqueado.

alter table ketzal.bookings
  add column if not exists cancel_fee_mxn numeric(12,2),
  add column if not exists cancelled_at timestamptz;

create or replace function ketzal.cancel_booking_v2(
  p_booking uuid, p_reason text, p_mode text, p_waive_fee boolean default false
) returns jsonb
language plpgsql
set search_path to 'ketzal', 'pg_temp'
as $$
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

  select * into v_b from ketzal.bookings where id = p_booking for update;  -- RLS
  if not found then raise exception 'Venta no encontrada o sin acceso'; end if;
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
    v_vig := coalesce((v_pol->'credito'->>'vigencia_meses')::int, 12);
    v_monto_credito := round(v_pagado * coalesce((v_pol->'credito'->>'pct')::numeric, 100) / 100, 2);

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

  return jsonb_build_object(
    'pena_mxn', v_pena,
    'pagado_mxn', v_pagado,
    'a_devolver_mxn', case when p_mode = 'efectivo' then greatest(0, v_pagado - v_pena) else 0 end,
    'credito_id', v_credit_id,
    'credito_mxn', v_monto_credito);
end $$;

revoke all on function ketzal.cancel_booking_v2(uuid, text, text, boolean) from public, anon;
grant execute on function ketzal.cancel_booking_v2(uuid, text, text, boolean) to authenticated, service_role;
