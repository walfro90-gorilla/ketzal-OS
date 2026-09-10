-- b109 — El plan de abonos del marketplace se ancla a la fecha del viaje.
--
-- Qué estaba mal: `generate_marketplace_payment_plan` hacía
--   v_final := coalesce(v_travel, p_final_date);
-- o sea que si el servicio no tiene salida cargada, el COMPRADOR elegía su
-- propio vencimiento en un `<input type="date">` de la pantalla de compra.
-- Reportado por el fundador: esa fecha no es del viajero, la pone Ketzal.
--
-- Medido antes de tocar (2026-09-09): de 7 servicios publicados, 6 tienen
-- salidas y ahí la fecha YA salía sola; el único sin ninguna fecha era
-- "TEST pago en línea $50" (0 salidas, available_from/to null, duration null),
-- que es fixture de pruebas de cobro. O sea que el hueco se abría solo para
-- servicios sin salida, no siempre.
--
-- Decisión (ADR-0064): la salida manda y no hay plan B. Sin fecha de viaje no
-- hay plan de abonos — se vende de contado o se coordina con la agencia. Se
-- descartó caer a `services.available_to` porque significa "hasta cuándo se
-- vende", no cuándo se viaja: anclar ahí un vencimiento de dinero es inventar
-- una fecha con cara de dato. Hoy además 0 servicios lo tienen lleno.
--
-- `p_final_date` SE CONSERVA en la firma pero se IGNORA: quitarlo rompería a
-- cualquier cliente viejo a media publicación, y el parámetro nunca fue
-- legítimo. Ignorarlo devuelve la conducta correcta en vez de un error.
--
-- Re-aplicada desde el DDL vivo (`pg_get_functiondef`, 2026-09-09): se
-- conservan el guard de canal de b091 y el borrado/reinserción del schedule.

create or replace function ketzal.generate_marketplace_payment_plan(
  p_booking_id uuid,
  p_frequency  text,
  p_final_date date default null  -- ignorado desde b109; ver cabecera
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'ketzal', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_total numeric; v_travel date; v_supplier uuid; v_mc uuid; v_final date;
  v_plan jsonb; v_item jsonb;
  v_channel text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select total, travel_date, selling_supplier_id, marketplace_customer_id, channel
    into v_total, v_travel, v_supplier, v_mc, v_channel
    from ketzal.bookings where id = p_booking_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_mc is null or v_mc <> v_uid then raise exception 'Pedido no encontrado o sin acceso'; end if;
  -- b091: el plan de una cotización del back-office lo fija el agente.
  if v_channel <> 'portal' then
    raise exception 'Este viaje lo lleva tu agencia: el plan de pagos va con ella.';
  end if;

  -- b109: la fecha del viaje es la ÚNICA ancla. `p_final_date` se ignora.
  v_final := v_travel;
  if v_final is null then
    raise exception 'Este viaje todavía no tiene fecha de salida, así que no se puede pagar en abonos. Págalo de contado o coordina con la agencia.';
  end if;

  v_plan := ketzal._compute_payment_plan(v_total, current_date, v_final, p_frequency, 0.20);

  delete from ketzal.payment_schedule where booking_id = p_booking_id;
  for v_item in select value from jsonb_array_elements(v_plan->'items') loop
    insert into ketzal.payment_schedule(booking_id, supplier_id, seq, kind, due_date, amount)
    values (p_booking_id, v_supplier, (v_item->>'seq')::int, v_item->>'kind',
            (v_item->>'due_date')::date, (v_item->>'amount')::numeric);
  end loop;

  update ketzal.bookings
     set payment_type = 'abonos', plan_frequency = p_frequency, plan_final_date = v_final
   where id = p_booking_id;
  return v_plan;
end $function$;
