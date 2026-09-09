-- HARD TESTING — un pedido cancelado y devuelto sigue visible para el viajero (b103).
--
--   pnpm hard-test cancelado_devuelto
--
-- Qué defiende: `list_my_marketplace_orders` y `get_my_trip` ya no esconden los
-- pedidos cancelados (el fundador devolvió una compra de prueba y "desapareció"
-- de Mis compras). Devuelven `refunded` = suma de pagos tipo refund
-- completados, para pintar "Cancelado · devuelto $X". Un cancelado no se
-- califica. El pago y la devolución entran por `register_payment` (RPC-only,
-- ADR-0006), no por INSERT.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  ag       uuid := '0000b103-0000-4000-8000-00000000a001';
  svc      uuid := '0000b103-0000-4000-8000-00000000c001';
  admin_u  uuid := '0000b103-0000-4000-8000-00000000d001';
  viajero  uuid := '0000b103-0000-4000-8000-00000000d002';
  cli      uuid := '0000b103-0000-4000-8000-00000000b001';
  b_dev    uuid := '0000b103-0000-4000-8000-00000000e001';  -- pagado, devuelto, cancelado
  b_ok     uuid := '0000b103-0000-4000-8000-00000000e002';  -- pagado normal (control)
  j jsonb; e jsonb; n int;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag,'QA b103 Agencia','qa.b103.a@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag, 'QA b103 Tour', 5000);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (admin_u,'qa.b103.admin@ketzal.local'), (viajero,'qa.b103.viajero@ketzal.local')) as u(id, mail);
  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (admin_u,'qa.b103.admin@ketzal.local','QA b103 Admin','admin',ag,'agente',true),
    (viajero,'qa.b103.viajero@ketzal.local','QA b103 Viajero','user',null,'viajero',true);
  insert into ketzal.customers(id,supplier_id,full_name,marketplace_customer_id) values
    (cli, ag, 'QA b103 Viajero', viajero);
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel, travel_date) values
    (b_dev, ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'reserved', 'portal', current_date + 10),
    (b_ok,  ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'reserved', 'portal', current_date + 10);

  -- El admin de la agencia cobra y luego devuelve (RPC-only, como en la vida real).
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', admin_u), true);
  perform set_config('role','authenticated',true);
  perform ketzal.register_payment(b_dev, 5000, 'mercadopago', now(), 'payment');
  perform ketzal.register_payment(b_ok,  5000, 'mercadopago', now(), 'payment');
  perform ketzal.register_payment(b_dev, 5000, 'mercadopago', now(), 'refund');
  perform set_config('role','postgres',true);
  update ketzal.bookings set status = 'cancelled' where id = b_dev;

  ------------------------------------------------------ como el viajero ---
  perform set_config('request.jwt.claims', json_build_object('sub', viajero)::text, true);
  perform set_config('role','authenticated',true);
  j := ketzal.list_my_marketplace_orders();

  -- 1 · Los dos pedidos aparecen: el cancelado ya no desaparece.
  select count(*) into n from jsonb_array_elements(j) x where x->>'booking_id' in (b_dev::text, b_ok::text);
  if n = 2 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [1 la lista trajo %s de 2 pedidos]', n); end if;

  select x into e from jsonb_array_elements(j) x where x->>'booking_id' = b_dev::text;
  -- 2 · Estado cancelado, con lo devuelto y sin nada pagado neto.
  if e->>'status' = 'cancelled' and (e->>'refunded')::numeric = 5000 and (e->>'paid')::numeric = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [2 cancelado: status=%s refunded=%s paid=%s]', e->>'status', e->>'refunded', e->>'paid'); end if;
  -- 3 · Un cancelado no se califica.
  if (e->>'can_rate')::boolean = false then ok:=ok+1; else fails:=fails+1; det:=det||' [3 can_rate en cancelado]'; end if;
  -- 4 · El control sigue pagado y sin devolución.
  select x into e from jsonb_array_elements(j) x where x->>'booking_id' = b_ok::text;
  if e->>'status' = 'paid' and (e->>'refunded')::numeric = 0 and (e->>'paid')::numeric = 5000 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [4 control: status=%s refunded=%s paid=%s]', e->>'status', e->>'refunded', e->>'paid'); end if;

  -- 5 · El detalle del cancelado se abre y trae lo devuelto.
  j := ketzal.get_my_trip(b_dev);
  if j is not null and j->'booking'->>'status' = 'cancelled' and (j->'money'->>'refunded')::numeric = 5000 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [5 detalle del cancelado: %s]', coalesce(j->'money', j)); end if;
  -- 6 · …y la BD no deja calificarlo.
  begin
    perform ketzal.submit_rating(b_dev, 'traveler_to_provider', 5, 'x');
    fails:=fails+1; det:=det||' [6 se calificó un pedido cancelado]';
  exception when others then ok:=ok+1; end;

  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims', null, true);

  raise exception 'CANCELADO -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
