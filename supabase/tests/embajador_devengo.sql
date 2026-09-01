-- Hard-test de b079 — el embajador devenga cuando la venta es real.
--
-- REPLAYABLE Y SIN RASTRO: todo vive dentro de un DO block que TERMINA CON
-- `raise exception`. Esa excepción aborta el bloque, así que Postgres revierte
-- cada insert — incluidas las `commission_lines`, que `no_mutar` prohíbe BORRAR
-- pero no impide REVERTIR. El resultado del test viaja en el mensaje de la
-- excepción. Feo, y es a propósito: es la única forma de que ningún camino
-- —ni un fallo a media prueba— deje dinero de mentiras en producción.
--
--   psql "$DATABASE_URL" -f supabase/tests/embajador_devengo.sql
--   (o pegado en el SQL editor / execute_sql: siempre revierte)
--
-- Por qué no se extendió `comisiones_motor.sql`: ese archivo siembra
-- `ketzal.marketplace_customers`, tabla ELIMINADA por el refactor de identidad
-- (b025). Lleva desde entonces sin poder correr.
--
-- Cubre lo que b079 cambió:
--   1. draft con embajador          → NO devenga (antes sí: deuda fantasma)
--   2. draft → reserved             → devenga, con el monto de la tarifa
--   3. reserved → confirmed → paid  → no duplica (idempotente)
--   4. venta de back-office         → devenga vía `UPDATE OF ambassador_id`
--                                     (si falta esa palabra en el trigger, muere aquí)
--   5. agencia sin tarifa           → 0 líneas + miss 'sin_tarifa_de_la_agencia'
--   6. el miss no se duplica en cada cambio de estado
--   7. comisión que excede la venta → miss, no línea
--   8. cancelar                     → reverso, neto 0
--   9. draft con embajador          → se puede BORRAR (antes: 23503 para siempre)

do $$
declare
  v_ag      uuid := 'aaaa0079-0000-4000-8000-000000000001';  -- agencia con tarifa
  v_ag2     uuid := 'aaaa0079-0000-4000-8000-000000000002';  -- agencia SIN tarifa
  v_svc     uuid := 'bbbb0079-0000-4000-8000-000000000001';
  v_svc2    uuid := 'bbbb0079-0000-4000-8000-000000000002';
  v_cli     uuid := 'cccc0079-0000-4000-8000-000000000001';
  v_cli2    uuid := 'cccc0079-0000-4000-8000-000000000002';
  v_emb     uuid;                                            -- embajador existente
  b_draft   uuid := 'dddd0079-0000-4000-8000-00000000000a';
  b_back    uuid := 'dddd0079-0000-4000-8000-00000000000b';
  b_sintar  uuid := 'dddd0079-0000-4000-8000-00000000000c';
  b_excede  uuid := 'dddd0079-0000-4000-8000-00000000000d';
  b_borrar  uuid := 'dddd0079-0000-4000-8000-00000000000e';
  n int; s numeric; ok int := 0; fails int := 0; det text := '';
begin
  -- Un embajador REAL cualquiera: no se crean cuentas (las FK de bookings hacia
  -- profiles no tienen cascade, así que una cuenta de prueba con venta quedaría
  -- imborrable). Da igual cuál: todo se revierte.
  select id into v_emb from ketzal.profiles where type = 'embajador' and active limit 1;
  if v_emb is null then raise exception 'No hay ningún embajador para el test'; end if;

  insert into ketzal.suppliers(id, name, contact_email, supplier_type, commission_rate)
  values (v_ag,  'QA079 Con tarifa', 'qa079a@qa.test', 'agency', 0),
         (v_ag2, 'QA079 Sin tarifa', 'qa079b@qa.test', 'agency', 0);
  insert into ketzal.services(id, supplier_id, name, price)
  values (v_svc, v_ag, 'QA079 Tour', 1000), (v_svc2, v_ag2, 'QA079 Tour2', 1000);
  -- `bookings.customer_id` es NOT NULL: sin cliente no hay venta que insertar.
  insert into ketzal.customers(id, supplier_id, full_name)
  values (v_cli, v_ag, 'QA079 Cliente'), (v_cli2, v_ag2, 'QA079 Cliente2');

  -- Tarifa de la agencia dueña (m008): $150 por pasajero.
  insert into ketzal.commission_rules(service_id, payee_type, scope_supplier_id, basis, unit_amount)
  values (null, 'embajador', v_ag, 'fijo_pax', 150);

  ---------------------------------------------------------------- 1 y 2
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              ambassador_id, num_pax, subtotal, discount, total, status, channel)
  values (b_draft, v_ag, v_ag, v_cli, v_svc, v_emb, 2, 2000, 0, 2000, 'draft', 'portal');

  select count(*) into n from ketzal.commission_lines
   where booking_id = b_draft and payee_type = 'embajador';
  if n = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [1 FALLA: draft devengó %s líneas]', n); end if;

  update ketzal.bookings set status = 'reserved' where id = b_draft;
  select coalesce(sum(amount_mxn), 0) into s from ketzal.commission_lines
   where booking_id = b_draft and payee_type = 'embajador' and kind = 'devengo';
  if s = 300 then ok := ok + 1;   -- 2 pax × $150
  else fails := fails + 1; det := det || format(' [2 FALLA: reserved devengó %s, esperaba 300]', s); end if;

  ---------------------------------------------------------------- 3 idempotencia
  update ketzal.bookings set status = 'confirmed' where id = b_draft;
  update ketzal.bookings set status = 'paid' where id = b_draft;
  select count(*) into n from ketzal.commission_lines
   where booking_id = b_draft and payee_type = 'embajador' and kind = 'devengo';
  if n = 1 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [3 FALLA: %s líneas tras 3 cambios de estado]', n); end if;

  ---------------------------------------------------------------- 4 back-office
  -- Nace YA en 'reserved' y sin embajador; se le asigna después. Sin
  -- `UPDATE OF ambassador_id` en el trigger, esto NUNCA devengaría.
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              num_pax, subtotal, discount, total, status, channel)
  values (b_back, v_ag, v_ag, v_cli, v_svc, 1, 1000, 0, 1000, 'reserved', 'manual');
  update ketzal.bookings set ambassador_id = v_emb where id = b_back;
  select coalesce(sum(amount_mxn), 0) into s from ketzal.commission_lines
   where booking_id = b_back and payee_type = 'embajador' and kind = 'devengo';
  if s = 150 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [4 FALLA: back-office devengó %s, esperaba 150 — ¿falta UPDATE OF ambassador_id?]', s); end if;

  ---------------------------------------------------------------- 5 y 6 sin tarifa
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              ambassador_id, num_pax, subtotal, discount, total, status, channel)
  values (b_sintar, v_ag2, v_ag2, v_cli2, v_svc2, v_emb, 1, 1000, 0, 1000, 'reserved', 'portal');
  select count(*) into n from ketzal.commission_lines
   where booking_id = b_sintar and payee_type = 'embajador';
  if n = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [5 FALLA: devengó %s sin tarifa]', n); end if;

  update ketzal.bookings set status = 'confirmed' where id = b_sintar;
  update ketzal.bookings set status = 'paid' where id = b_sintar;
  select count(*) into n from ketzal.referral_misses
   where booking_id = b_sintar and reason = 'sin_tarifa_de_la_agencia';
  if n = 1 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [6 FALLA: %s misses, esperaba 1 sin duplicar]', n); end if;

  ---------------------------------------------------------------- 7 excede la venta
  -- Venta de $100 con tarifa de $150/pax: la comisión no cabe.
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              ambassador_id, num_pax, subtotal, discount, total, status, channel)
  values (b_excede, v_ag, v_ag, v_cli, v_svc, v_emb, 1, 100, 0, 100, 'reserved', 'portal');
  select count(*) into n from ketzal.commission_lines
   where booking_id = b_excede and payee_type = 'embajador';
  if n = 0 and exists (select 1 from ketzal.referral_misses
                        where booking_id = b_excede and reason = 'comisiones_exceden_la_venta')
  then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [7 FALLA: %s líneas y sin miss por exceder]', n); end if;

  ---------------------------------------------------------------- 8 cancelar reversa
  update ketzal.bookings set status = 'cancelled' where id = b_draft;
  insert into ketzal.commission_lines(booking_id, payee_type, payee_profile_id, basis,
                                      unit_amount, num_pax, amount_mxn, kind, reverses_line_id)
  select booking_id, payee_type, payee_profile_id, basis, unit_amount, num_pax, amount_mxn,
         'reverso', id
    from ketzal.commission_lines
   where booking_id = b_draft and payee_type = 'embajador' and kind = 'devengo';
  select coalesce(sum(case when kind = 'devengo' then amount_mxn else -amount_mxn end), 0)
    into s from ketzal.commission_lines where booking_id = b_draft and payee_type = 'embajador';
  if s = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [8 FALLA: neto tras reverso %s, esperaba 0]', s); end if;

  ---------------------------------------------------------------- 9 draft borrable
  -- El bug que b079 cierra de paso: con la línea colgando del draft, la FK sin
  -- cascade + `no_mutar` volvían el pedido imborrable para siempre (23503).
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              ambassador_id, num_pax, subtotal, discount, total, status, channel)
  values (b_borrar, v_ag, v_ag, v_cli, v_svc, v_emb, 1, 1000, 0, 1000, 'draft', 'portal');
  begin
    delete from ketzal.bookings where id = b_borrar;
    ok := ok + 1;
  exception when others then
    fails := fails + 1;
    det := det || format(' [9 FALLA: no se pudo borrar el draft con embajador: %s]', sqlerrm);
  end;

  ---------------------------------------------------------------- resultado
  -- La excepción REVIERTE TODO. Es el mecanismo, no un error.
  raise exception 'RESULTADO b079 — % pasaron, % fallaron.%  (todo revertido, sin rastro)',
    ok, fails, coalesce(nullif(det, ''), ' Sin fallas.');
end $$;
