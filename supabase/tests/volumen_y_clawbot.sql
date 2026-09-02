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
-- Se corre solo: `pnpm hard-test volumen_y_clawbot`.
--
-- Antes exigía `qa_setup.sql` sembrado a mano y NO revertía: llevaba desde la
-- limpieza del 2026-08-23 sin correr, y correrlo habría sembrado agencias QA en
-- producción. Ahora crea su agencia aquí dentro, verifica que las CUATRO reglas
-- disparen, y revierte todo (ADR-0035).

do $$
declare
  ALFA_A constant uuid := '0000c1a0-0000-4000-8000-00000000a001';
  ALFA_U constant text := '0000c1a0-0000-4000-8000-00000000a002';
  v_b uuid; i int; v_total numeric; v_gen int;
  v_falt text; v_n int;
begin
  ------------------------------------------------------------------ fixtures --
  insert into ketzal.suppliers (id, name, supplier_type, contact_email)
    values (ALFA_A, 'QA Clawbot Alfa', 'agency', 'qa.clawbot.alfa@ketzal.local');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values (ALFA_U::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'qa.clawbot.admin@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','','');
  insert into ketzal.profiles (id, email, name, role, supplier_id, type, active)
    values (ALFA_U::uuid,'qa.clawbot.admin@ketzal.local','QA Clawbot Admin','admin',ALFA_A,'agente',true);

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

  -- ── Veredicto: un total > 0 NO basta ────────────────────────────────────
  -- Hay que ver que las CUATRO reglas disparen. Una que no dispare es una regla
  -- muerta que nadie notaría — y así fue como el primer tick de Clawbot devolvió
  -- {pendientes: 0} y se leyó como "funciona".
  select string_agg(r.regla, ', ') into v_falt
  from (values ('abono_vencido'), ('abono_por_vencer'),
               ('cotizacion_seguimiento'), ('viaje_proximo')) as r(regla)
  where not exists (
    select 1 from ketzal.clawbot_reminders c
    where c.kind = r.regla and c.supplier_id = ALFA_A);

  select count(*) into v_n from ketzal.clawbot_reminders where supplier_id = ALFA_A;

  if v_falt is null and v_n > 0 then
    raise exception 'CLAWBOT (volumen) -- 4 pasaron, 0 fallaron. % recordatorios de las 4 reglas  (todo revertido)', v_n;
  else
    raise exception 'CLAWBOT (volumen) -- % pasaron, % fallaron. [reglas que NO dispararon: %] (% recordatorios en total)',
      4 - coalesce(array_length(string_to_array(v_falt, ', '),1),0),
      coalesce(array_length(string_to_array(v_falt, ', '),1),0),
      coalesce(v_falt,'ninguna'), v_n;
  end if;

exception
  when sqlstate 'P0001' then raise;   -- el veredicto sale tal cual
  when others then
    -- Antes esto se tragaba la causa y dejaba que la transacción COMMITEARA.
    raise exception 'CLAWBOT (volumen) -- abortó antes de terminar: % (%)', sqlerrm, sqlstate;
end $$;

-- Sin `select` final: el veredicto viaja en el mensaje de la excepción.
