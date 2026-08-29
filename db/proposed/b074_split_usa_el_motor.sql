-- b074 — El fee del split de MP sale del motor de comisiones, no de un % plano.
--
-- Hueco de la auditoría: `mp-split.ts` calculaba el marketplace_fee leyendo
-- `app_settings.platform_commission_rate` (10% plano) en TypeScript, mientras el
-- DEVENGO (commission_lines) usa `resolve_commission_rule`/`commission_amount`.
-- El día que se configure una tarifa por servicio (% distinto, o fijo por pax),
-- los dos números divergen: el devengo usa la regla y el fee cobrado sigue en
-- 10%. Se unifica: un solo RPC calcula el fee con el mismo motor que el devengo.
--
-- El fee se PRORRATEA por la fracción del total que cubre el pago: pago completo
-- ⇒ fee = comisión total; enganche 50% ⇒ 50% del fee, y el resto lo lleva el
-- siguiente pago por MP. Si parte se paga fuera de MP (SPEI/efectivo), esa
-- fracción no genera fee de MP pero el devengo total sigue vivo como por-cobrar
-- (modelo devengo/liquidación) — así el fee cobrado nunca excede lo que devengó.
--
-- Sólo aplica a ventas del portal (channel='portal'): una venta manual no lleva
-- fee de plataforma, coherente con b072.

create or replace function ketzal.platform_fee_for_payment(p_booking uuid, p_amount numeric)
 returns numeric
 language plpgsql
 stable
 security definer
 set search_path to 'ketzal', 'pg_temp'
as $function$
declare
  v_service uuid; v_num_pax int; v_total numeric; v_channel text;
  r record; v_com_total numeric;
begin
  select service_id, num_pax, total, channel
    into v_service, v_num_pax, v_total, v_channel
    from ketzal.bookings where id = p_booking;
  if not found then return 0; end if;
  -- Sólo el portal comisiona (b072). Sin total, no hay sobre qué prorratear.
  if v_channel <> 'portal' or coalesce(v_total, 0) <= 0 then return 0; end if;

  select * into r from ketzal.resolve_commission_rule(v_service, 'plataforma', null);
  if r.basis is null then return 0; end if;

  v_com_total := ketzal.commission_amount(r.basis, r.rate, r.unit_amount, v_num_pax, v_total);
  if v_com_total <= 0 then return 0; end if;

  -- Prorrateo: fee completo si el pago cubre el total; nunca más que la comisión.
  return round(v_com_total * least(1, greatest(0, coalesce(p_amount, 0)) / v_total), 2);
end $function$;

revoke all on function ketzal.platform_fee_for_payment(uuid, numeric) from public, anon;
grant execute on function ketzal.platform_fee_for_payment(uuid, numeric) to authenticated, service_role;
