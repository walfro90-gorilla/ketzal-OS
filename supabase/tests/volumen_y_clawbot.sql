-- HARD TESTING — volumen + Clawbot (cierra el pendiente 3-ter del FODA).
--
-- Contexto: el primer tick de Clawbot en la historia devolvió {pendientes: 0}.
-- Eso NO probaba que el motor sirviera — no había una sola venta en la BD, así
-- que 0 era la única respuesta posible. Este script le da datos que SÍ califican
-- para cada una de sus 4 reglas y verifica que genere.
--
-- Las 4 reglas de clawbot_generar_recordatorios (leídas del cuerpo, no supuestas):
--   1 abono_por_vencer       payment_type='abonos', balance>0, próximo vencimiento en [hoy, hoy+3]
--   2 abono_vencido          payment_type='abonos', balance>0, Σ(vencidos) − pagado > 0
--   3 cotizacion_seguimiento status='draft' y creada hace >= 3 días
--   4 viaje_proximo          travel_date en [hoy+1, hoy+3]
--
-- El "paso del tiempo" se simula moviendo `payment_schedule.due_date` y
-- `bookings.created_at` hacia atrás. Es la única forma de tener cartera vencida
-- el mismo día que se crea; ninguna de las dos está en el conjunto append-only.
--
-- Requiere: qa_setup.sql. Todo cuelga de la agencia QA Alfa.

do $$
declare
  ALFA_U constant text := '00000000-0000-4000-8000-00000000a002';
  v_b uuid; i int; v_total numeric; v_gen int;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ALFA_U), true);
  perform set_config('role','authenticated',true);

  -- ── Bloque A: 12 ventas con plan de pagos VENCIDO (regla 2) ────────────
  -- Total feo a propósito en cada una: si el plan absorbe mal los centavos, la
  -- invariante Σabonos = total truena aquí y no en producción.
  for i in 1..12 loop
    v_total := 3000 + (i * 777.77);
    select ketzal.create_booking_with_items(null,
      format('{"full_name":"QA Vencido %s","phone":"656000%s"}', i, 1000+i)::jsonb,
      null, current_date + 60, 0, 'volumen: vencido',
      format('[{"item_type":"passenger","passenger_type":"adult","qty":2,"unit_price":%s}]', round(v_total/2,2))::jsonb,
      'reserved') into v_b;

    perform ketzal.generate_payment_plan(v_b, 'quincenal', current_date + 90, 0.20);
    -- Enganche pagado, el resto no: así el saldo queda > 0 y hay atraso real.
    perform ketzal.register_payment(v_b, round(v_total * 0.20, 2), 'efectivo', now(), 'payment');

    perform set_config('role','postgres',true);
    -- 100 días atrás: mete varias quincenas en el pasado.
    update ketzal.payment_schedule set due_date = due_date - 100 where booking_id = v_b;
    perform set_config('role','authenticated',true);
  end loop;

  -- ── Bloque B: 6 ventas con abono POR VENCER (regla 1) ──────────────────
  for i in 1..6 loop
    v_total := 5000 + (i * 313.13);
    select ketzal.create_booking_with_items(null,
      format('{"full_name":"QA PorVencer %s","phone":"656001%s"}', i, 1000+i)::jsonb,
      null, current_date + 60, 0, 'volumen: por vencer',
      format('[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":%s}]', v_total)::jsonb,
      'reserved') into v_b;
    perform ketzal.generate_payment_plan(v_b, 'mensual', current_date + 120, 0.10);
    perform ketzal.register_payment(v_b, round(v_total * 0.10, 2), 'efectivo', now(), 'payment');

    perform set_config('role','postgres',true);
    -- Deja el próximo vencimiento a 2 días: dentro de la ventana [hoy, hoy+3].
    update ketzal.payment_schedule
       set due_date = current_date + 2
     where booking_id = v_b
       and due_date = (select min(ps.due_date) from ketzal.payment_schedule ps
                        where ps.booking_id = v_b and ps.due_date > current_date);
    perform set_config('role','authenticated',true);
  end loop;

  -- ── Bloque C: 5 cotizaciones sin cerrar (regla 3) ──────────────────────
  for i in 1..5 loop
    select ketzal.create_booking_with_items(null,
      format('{"full_name":"QA Cotiza %s","phone":"656002%s"}', i, 1000+i)::jsonb,
      null, current_date + 45, 0, 'volumen: cotización',
      '[{"item_type":"passenger","passenger_type":"adult","qty":2,"unit_price":2500}]'::jsonb,
      'draft') into v_b;
    perform set_config('role','postgres',true);
    update ketzal.bookings set created_at = now() - interval '6 days' where id = v_b;
    perform set_config('role','authenticated',true);
  end loop;

  -- ── Bloque D: 5 viajes próximos (regla 4) ──────────────────────────────
  for i in 1..5 loop
    select ketzal.create_booking_with_items(null,
      format('{"full_name":"QA ViajeProx %s","phone":"656003%s"}', i, 1000+i)::jsonb,
      null, current_date + 2, 0, 'volumen: viaje próximo',
      '[{"item_type":"passenger","passenger_type":"adult","qty":3,"unit_price":1200}]'::jsonb,
      'reserved') into v_b;
    perform ketzal.register_payment(v_b, 1000, 'efectivo', now(), 'payment');
  end loop;

  perform set_config('role','postgres',true);
  select ketzal.clawbot_generar_recordatorios() into v_gen;
  insert into ketzal.system_log(source, level, event, detail)
  values ('qa_harness','info','volumen — clawbot generó',
          jsonb_build_object('pendientes_totales', v_gen));
exception when others then
  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail)
  values ('qa_harness','error','volumen abortó', jsonb_build_object('err', sqlerrm, 'code', sqlstate));
end $$;

-- Desglose por regla: un total > 0 no basta, hay que ver que las CUATRO reglas
-- disparen. Una que no dispare es una regla muerta que nadie notaría.
select kind, count(*) as recordatorios
from ketzal.clawbot_reminders group by kind
union all
select '— TOTAL pendientes —', count(*) from ketzal.clawbot_reminders where status='pendiente'
union all
select '— ventas QA creadas —', count(*) from ketzal.bookings
  where selling_supplier_id = '00000000-0000-4000-8000-00000000a001'
order by 1;
