-- HARD TESTING — rutas de ESCRITURA del motor de dinero.
--
-- Complemento de `money_invariants.sql`, que sólo cubre la función pura del plan
-- de pagos y es read-only. Ese archivo dejó anotado su propio pendiente:
--   "Siguiente incremento (rutas con escritura: folio atómico, register_payment,
--    comisiones) requiere un harness transaccional aparte."
-- Esto es ese harness.
--
-- Se corre solo: `pnpm hard-test hard_testing_dinero`.
--
-- Antes exigía `qa_setup.sql` sembrado a mano, y esas fixtures se borraron en la
-- limpieza del 2026-08-23 ⇒ llevaba desde entonces sin correr, en silencio.
-- Ahora siembra sus DOS agencias e identidades aquí dentro y revierte todo al
-- final (ADR-0035): no depende de nada previo y no deja un byte escrito.
--
-- CÓMO PRUEBA, y por qué así:
--  - Maneja los RPCs REALES, nunca INSERT crudos. Un insert directo se salta
--    triggers, folio y RLS — reportaría verde sin probar nada.
--  - Suplanta identidad con `request.jwt.claims` + `role=authenticated`. Desde
--    el SQL editor uno es superusuario y **la RLS ni se evalúa**: un harness que
--    no haga esto da verde siempre y es peor que no tener harness.
--  - Cada resultado queda en `system_log` (source='qa_harness'), que desde
--    `002_ledger_inmutable.sql` es append-only ⇒ el historial de corridas es
--    parte de la huella inborrable.
--
-- CONVENCIÓN DE NIVELES en system_log:
--    info      = la guarda existe y funcionó (esperado)
--    critical  = HUECO: la operación indebida fue aceptada
--
-- Los veredictos siguen yendo a `system_log` (source='qa_harness') porque es
-- donde el harness los sabe escribir — pero ya NO sobreviven a la corrida: la
-- transacción entera se revierte. La regla vieja de "los datos QA no se borran"
-- (2026-07-19) quedó sustituida por ADR-0023 y ADR-0035.

do $$
declare
  ALFA_A constant uuid := '0000d10e-0000-4000-8000-00000000a001';  -- agencia Alfa
  BETA_A constant uuid := '0000d10e-0000-4000-8000-00000000b001';  -- agencia Beta
  ALFA_U constant text := '0000d10e-0000-4000-8000-00000000a002';  -- admin de Alfa
  BETA_U constant text := '0000d10e-0000-4000-8000-00000000b002';  -- admin de Beta
  v_b uuid; v_bal numeric; v_pay uuid; v_err text; v_paso boolean;
  v_folio1 bigint; v_folio2 bigint; v_n int;
  v_t0 timestamptz; v_huecos int;
begin
  -- `now()` y NO `clock_timestamp()`: las filas de system_log se sellan con el
  -- timestamp de la TRANSACCIÓN. Con clock_timestamp() el corte quedaba después
  -- de ellas y el conteo daba 0 — un verde vacío perfecto, que es justo el
  -- fallo que este archivo existe para no tener.
  v_t0 := now();

  ------------------------------------------------------------------ fixtures --
  -- Dos agencias para poder probar el cruce de tenants (caso 4). Propias del
  -- harness: nunca se opera sobre las reales.
  insert into ketzal.suppliers (id, name, supplier_type, contact_email) values
    (ALFA_A, 'QA Dinero Alfa', 'agency', 'qa.dinero.alfa@ketzal.local'),
    (BETA_A, 'QA Dinero Beta', 'agency', 'qa.dinero.beta@ketzal.local');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (ALFA_U,'qa.dinero.alfa.admin@ketzal.local'),
               (BETA_U,'qa.dinero.beta.admin@ketzal.local')) as u(id, mail);
  insert into ketzal.profiles (id, email, name, role, supplier_id, type, active) values
    (ALFA_U::uuid,'qa.dinero.alfa.admin@ketzal.local','QA Alfa Admin','admin',ALFA_A,'agente',true),
    (BETA_U::uuid,'qa.dinero.beta.admin@ketzal.local','QA Beta Admin','admin',BETA_A,'agente',true);

  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', ALFA_U), true);
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 1
  -- Sobrepago: saldo 3000, se intenta abonar 50000.
  -- Esperado por regla de negocio: RECHAZO (no se puede recibir más de lo que
  -- se adeuda). Lectura previa de register_payment dice que NO hay tal guarda.
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Sobrepago"}'::jsonb, null, current_date + 30, 0, 'caso 1',
    '[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":3000}]'::jsonb,
    'reserved') into v_b;

  v_paso := true; v_err := null;
  begin
    select ketzal.register_payment(v_b, 50000, 'efectivo', now(), 'payment') into v_bal;
  exception when others then v_paso := false; v_err := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail) values
    ('qa_harness', case when v_paso then 'critical' else 'info' end,
     'caso 1 — sobrepago (abonar 50000 sobre saldo 3000)',
     jsonb_build_object('aceptado', v_paso, 'error', v_err,
       'saldo_resultante', v_bal, 'booking', v_b,
       'veredicto', case when v_paso then 'HUECO: aceptó más de lo adeudado'
                         else 'guarda presente' end));
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 2
  -- Reembolso mayor a lo abonado: se abona 500 y se reembolsa 9000.
  -- El saldo derivado es total − pagos + reembolsos, así que un refund inflado
  -- hace que el cliente "deba" más de lo que costó el viaje: dinero inventado.
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Refund Inflado"}'::jsonb, null, current_date + 30, 0, 'caso 2',
    '[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":3000}]'::jsonb,
    'reserved') into v_b;
  perform ketzal.register_payment(v_b, 500, 'efectivo', now(), 'payment');

  v_paso := true; v_err := null;
  begin
    select ketzal.register_payment(v_b, 9000, 'efectivo', now(), 'refund') into v_bal;
  exception when others then v_paso := false; v_err := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail) values
    ('qa_harness', case when v_paso then 'critical' else 'info' end,
     'caso 2 — reembolso 9000 sobre 500 abonados',
     jsonb_build_object('aceptado', v_paso, 'error', v_err,
       'saldo_resultante', v_bal, 'booking', v_b,
       'veredicto', case when v_paso then 'HUECO: reembolsó dinero que nunca entró'
                         else 'guarda presente' end));
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 3
  -- Monto <= 0. Aquí SÍ hay guarda explícita en el RPC; se verifica que siga.
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Monto Cero"}'::jsonb, null, current_date + 30, 0, 'caso 3',
    '[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":3000}]'::jsonb,
    'reserved') into v_b;

  v_paso := true; v_err := null;
  begin
    perform ketzal.register_payment(v_b, -1000, 'efectivo', now(), 'payment');
  exception when others then v_paso := false; v_err := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail) values
    ('qa_harness', case when v_paso then 'critical' else 'info' end,
     'caso 3 — abono negativo (-1000)',
     jsonb_build_object('aceptado', v_paso, 'error', v_err, 'booking', v_b));
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 4
  -- FUGA ENTRE INQUILINOS (riesgo #1 del proyecto). El agente de Beta intenta
  -- abonar sobre una venta de Alfa. Debe ser imposible: la RLS no debe siquiera
  -- dejarle ver la venta.
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Venta De Alfa"}'::jsonb, null, current_date + 30, 0, 'caso 4',
    '[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":3000}]'::jsonb,
    'reserved') into v_b;

  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', BETA_U), true);

  v_paso := true; v_err := null;
  begin
    perform ketzal.register_payment(v_b, 100, 'efectivo', now(), 'payment');
  exception when others then v_paso := false; v_err := sqlerrm;
  end;
  select count(*) into v_n from ketzal.bookings where id = v_b;   -- ¿la ve?

  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail) values
    ('qa_harness', case when v_paso or v_n > 0 then 'critical' else 'info' end,
     'caso 4 — Beta abona sobre venta de Alfa (fuga entre inquilinos)',
     jsonb_build_object('abono_aceptado', v_paso, 'error', v_err,
       'filas_visibles_para_beta', v_n, 'booking', v_b,
       'veredicto', case when v_paso then 'HUECO CRÍTICO: escribió en otra agencia'
                         when v_n > 0 then 'HUECO: puede LEER otra agencia'
                         else 'RLS aislando correctamente' end));
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', ALFA_U), true);
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 5
  -- Recibo duplicado sobre el mismo abono. `emit_receipt` lo evita con un
  -- check-then-insert, y NO hay índice único en receipts.payment_id. En
  -- secuencial debe rebotar; la carrera real se prueba aparte (concurrencia).
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Recibo Doble"}'::jsonb, null, current_date + 30, 0, 'caso 5',
    '[{"item_type":"passenger","passenger_type":"adult","qty":1,"unit_price":3000}]'::jsonb,
    'reserved') into v_b;
  perform ketzal.register_payment(v_b, 1000, 'efectivo', now(), 'payment');
  select id into v_pay from ketzal.payments where booking_id = v_b order by created_at desc limit 1;

  select ketzal.emit_receipt(v_pay) into v_folio1;
  v_paso := true; v_err := null;
  begin
    select ketzal.emit_receipt(v_pay) into v_folio2;
  exception when others then v_paso := false; v_err := sqlerrm;
  end;
  perform set_config('role','postgres',true);
  insert into ketzal.system_log(source, level, event, detail) values
    ('qa_harness', case when v_paso then 'critical' else 'info' end,
     'caso 5 — dos recibos para el mismo abono (secuencial)',
     jsonb_build_object('aceptado', v_paso, 'error', v_err,
       'folio_1', v_folio1, 'folio_2', v_folio2, 'payment', v_pay));
  perform set_config('role','authenticated',true);

  ---------------------------------------------------------------- CASO 6
  -- Saldo derivado: la regla de oro #2. total − Σpagos + Σreembolsos, calculado
  -- por la vista, debe coincidir con la suma cruda de la tabla payments.
  select ketzal.create_booking_with_items(null,
    '{"full_name":"QA Saldo Derivado"}'::jsonb, null, current_date + 30, 0, 'caso 6',
    '[{"item_type":"passenger","passenger_type":"adult","qty":3,"unit_price":1333.33}]'::jsonb,
    'reserved') into v_b;
  perform ketzal.register_payment(v_b, 1000.01, 'efectivo', now(), 'payment');
  perform ketzal.register_payment(v_b, 0.01,    'efectivo', now(), 'payment');
  perform ketzal.register_payment(v_b, 500.50,  'efectivo', now(), 'refund');

  perform set_config('role','postgres',true);
  select v.balance into v_bal from ketzal.bookings_with_balance v where v.id = v_b;
  insert into ketzal.system_log(source, level, event, detail)
  select 'qa_harness',
         case when v_bal = esperado then 'info' else 'critical' end,
         'caso 6 — saldo derivado con centavos',
         jsonb_build_object('saldo_vista', v_bal, 'saldo_esperado', esperado,
                            'booking', v_b)
  from (select b.total - coalesce(sum(case when p.type='payment' then p.amount_mxn
                                           else -p.amount_mxn end),0) as esperado
        from ketzal.bookings b
        left join ketzal.payments p on p.booking_id=b.id and p.status='COMPLETED'
        where b.id = v_b group by b.total) s;
  perform set_config('role','authenticated',true);

  perform set_config('role','postgres',true);

  -- ── Veredicto máquina ────────────────────────────────────────────────────
  select count(*) into v_huecos from ketzal.system_log
   where source='qa_harness' and level='critical' and ts >= v_t0;
  select count(*) into v_n from ketzal.system_log
   where source='qa_harness' and ts >= v_t0;

  -- Guard anti verde-vacío: si no se registró NI UN caso, el harness no probó
  -- nada, y eso es una falla — no un éxito silencioso. Este guard existe porque
  -- la primera versión de este cierre reportó "0 pasaron, 0 fallaron" y el
  -- corredor lo dio por VERDE.
  if v_n = 0 then
    raise exception 'DINERO (escritura) -- 0 pasaron, 1 fallaron. [no registró ningún caso: no probó nada]';
  end if;

  raise exception 'DINERO (escritura) -- % pasaron, % fallaron.%  (todo revertido)',
    v_n - v_huecos, v_huecos,
    coalesce((select ' HUECOS: '||string_agg(event, ' · ')
                from ketzal.system_log
               where source='qa_harness' and level='critical' and ts >= v_t0), ' Sin fallas.');

exception
  -- El `raise` del veredicto es la salida NORMAL: se deja pasar tal cual para
  -- que Postgres revierta y el corredor lo lea.
  when sqlstate 'P0001' then raise;
  when others then
    -- Antes esto se tragaba la causa: la anotaba en system_log y seguía como si
    -- nada, así que un harness que moría en el caso 2 se reportaba igual que uno
    -- que corrió los 6. Ahora dice qué lo mató.
    raise exception 'DINERO (escritura) -- abortó antes de terminar: % (%)', sqlerrm, sqlstate;
end $$;

-- Sin `select` final: el `raise` de arriba ya abortó la transacción, así que
-- cualquier sentencia posterior moriría con "current transaction is aborted".
-- El veredicto de cada caso viaja en el mensaje de la excepción.
