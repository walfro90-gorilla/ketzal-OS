-- HARD TESTING — el plan de abonos se ancla a la fecha del viaje (b109, ADR-0064).
--
--   pnpm hard-test plan_abonos
--
-- Qué defiende: `generate_marketplace_payment_plan` NO acepta que el comprador
-- ponga el vencimiento de su propia deuda. Con salida, el plan se ancla ahí e
-- IGNORA `p_final_date` aunque se lo manden. Sin salida, no hay plan: rebota
-- con un mensaje que el operador puede leer (P0001) y no escribe nada en
-- `payment_schedule`.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.
-- No toca una fila real: crea su agencia, su servicio, su viajero y sus pedidos.

do $$
declare
  ag      uuid := '0000b109-0000-4000-8000-00000000a001';
  svc     uuid := '0000b109-0000-4000-8000-00000000c001';
  viajero uuid := '0000b109-0000-4000-8000-00000000d001';
  cli     uuid := '0000b109-0000-4000-8000-00000000b001';
  b_con   uuid := '0000b109-0000-4000-8000-00000000e001';  -- con fecha de viaje
  b_sin   uuid := '0000b109-0000-4000-8000-00000000e002';  -- sin fecha de viaje
  v_viaje date := current_date + 60;
  j jsonb; n int; d date; msg text;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag,'QA b109 Agencia','qa.b109.a@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag, 'QA b109 Tour', 5000);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values (viajero,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'qa.b109.viajero@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','','');
  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (viajero,'qa.b109.viajero@ketzal.local','QA b109 Viajero','user',null,'viajero',true);
  insert into ketzal.customers(id,supplier_id,full_name,marketplace_customer_id) values
    (cli, ag, 'QA b109 Viajero', viajero);
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status,
                              channel, travel_date) values
    (b_con, ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'draft', 'portal', v_viaje),
    (b_sin, ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'draft', 'portal', null);

  perform set_config('request.jwt.claims', json_build_object('sub', viajero)::text, true);
  perform set_config('role','authenticated',true);

  -- 1 · Con salida: el plan se ancla a la fecha del viaje.
  j := ketzal.generate_marketplace_payment_plan(b_con, 'quincenal');
  if (j->>'final')::date = v_viaje then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [1 ancló en %s y no en %s]', j->>'final', v_viaje); end if;

  -- 2 · …y la venta guarda ese mismo vencimiento.
  --     Se lee como postgres a propósito: la RLS de `bookings` no deja al
  --     viajero hacer SELECT directo (lee por `list_my_marketplace_orders`),
  --     así que leerlo como `authenticated` devolvía NULL y la aserción medía
  --     la RLS en vez del plan. Medido: como postgres sí trae la fecha.
  perform set_config('role','postgres',true);
  select plan_final_date into d from ketzal.bookings where id = b_con;
  perform set_config('role','authenticated',true);
  if d = v_viaje then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [2 plan_final_date=%s]', d); end if;

  -- 3 · Mandar una fecha del comprador NO la mueve: p_final_date se ignora.
  --     Este es el bug que reportó el fundador; aquí queda fijado.
  j := ketzal.generate_marketplace_payment_plan(b_con, 'quincenal', current_date + 5);
  if (j->>'final')::date = v_viaje then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [3 el comprador movió el vencimiento a %s]', j->>'final'); end if;

  -- 4 · Sin salida: no hay plan, y el mensaje es legible (no un código pelón).
  begin
    perform ketzal.generate_marketplace_payment_plan(b_sin, 'quincenal');
    fails:=fails+1; det:=det||' [4 generó plan sin fecha de viaje]';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg like '%no tiene fecha de salida%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [4 mensaje inesperado: %s]', msg); end if;
  end;

  -- 5 · …y tampoco con fecha del comprador: sin viaje no hay ancla, punto.
  begin
    perform ketzal.generate_marketplace_payment_plan(b_sin, 'quincenal', current_date + 30);
    fails:=fails+1; det:=det||' [5 el comprador se puso su propio vencimiento]';
  exception when others then ok:=ok+1; end;

  -- 6 · El pedido sin salida quedó SIN calendario de pagos (no a medias).
  perform set_config('role','postgres',true);
  select count(*) into n from ketzal.payment_schedule where booking_id = b_sin;
  if n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [6 quedaron %s filas de schedule]', n); end if;

  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims', null, true);

  raise exception 'PLAN ABONOS -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
