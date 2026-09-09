-- HARD TESTING — se califica solo DESPUÉS del viaje, y desde el detalle (b102).
--
--   pnpm hard-test calificar_despues_del_viaje
--
-- Qué defiende: `can_rate` (lista y detalle) es verdadero únicamente para un
-- pedido PAGADO cuya fecha de viaje YA PASÓ. Antes `travel_date is null`
-- también prendía la calificación, y el fundador vio "Califica tu viaje" al
-- momento de comprar. `submit_rating` aplica la misma regla en la BD: la UI
-- que la esconde no es la frontera. El detalle (`get_my_trip`) devuelve el
-- bloque `rating` con lo ya calificado.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  ag       uuid := '0000b102-0000-4000-8000-00000000a001';
  svc      uuid := '0000b102-0000-4000-8000-00000000c001';
  viajero  uuid := '0000b102-0000-4000-8000-00000000d001';
  otro     uuid := '0000b102-0000-4000-8000-00000000d002';
  cli      uuid := '0000b102-0000-4000-8000-00000000b001';
  b_fut    uuid := '0000b102-0000-4000-8000-00000000e001';  -- pagado, viaja en 7 días
  b_pas    uuid := '0000b102-0000-4000-8000-00000000e002';  -- pagado, viajó ayer
  b_null   uuid := '0000b102-0000-4000-8000-00000000e003';  -- pagado, sin fecha
  b_draft  uuid := '0000b102-0000-4000-8000-00000000e004';  -- sin pagar, fecha pasada
  j jsonb; got boolean; n int;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag,'QA b102 Agencia','qa.b102.a@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag, 'QA b102 Tour', 5000);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (viajero,'qa.b102.viajero@ketzal.local'), (otro,'qa.b102.otro@ketzal.local')) as u(id, mail);
  insert into ketzal.profiles(id,email,name,role,type,active) values
    (viajero,'qa.b102.viajero@ketzal.local','QA b102 Viajero','user','viajero',true),
    (otro,   'qa.b102.otro@ketzal.local',   'QA b102 Otro',   'user','viajero',true);
  insert into ketzal.customers(id,supplier_id,full_name,marketplace_customer_id) values
    (cli, ag, 'QA b102 Viajero', viajero);

  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel, travel_date) values
    (b_fut,   ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'paid',  'portal', current_date + 7),
    (b_pas,   ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'paid',  'portal', current_date - 1),
    (b_null,  ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'paid',  'portal', null),
    (b_draft, ag, ag, cli, svc, viajero, 1, 5000, 0, 5000, 'draft', 'portal', current_date - 1);

  ------------------------------------------------------ como el viajero ---
  perform set_config('request.jwt.claims', json_build_object('sub', viajero)::text, true);
  set local role authenticated;

  j := ketzal.list_my_marketplace_orders();
  -- 1 · pagado con fecha futura: NO se califica todavía.
  select (e->>'can_rate')::boolean into got from jsonb_array_elements(j) e where e->>'booking_id' = b_fut::text;
  if got = false then ok:=ok+1; else fails:=fails+1; det:=det||format(' [1 can_rate con viaje futuro = %s]', got); end if;
  -- 2 · pagado y ya viajó: sí.
  select (e->>'can_rate')::boolean into got from jsonb_array_elements(j) e where e->>'booking_id' = b_pas::text;
  if got = true then ok:=ok+1; else fails:=fails+1; det:=det||format(' [2 can_rate con viaje pasado = %s]', got); end if;
  -- 3 · pagado SIN fecha: no (era el hueco que prendía la calificación al comprar).
  select (e->>'can_rate')::boolean into got from jsonb_array_elements(j) e where e->>'booking_id' = b_null::text;
  if got = false then ok:=ok+1; else fails:=fails+1; det:=det||format(' [3 can_rate sin fecha = %s]', got); end if;
  -- 4 · sin pagar, aunque la fecha haya pasado: no.
  select (e->>'can_rate')::boolean into got from jsonb_array_elements(j) e where e->>'booking_id' = b_draft::text;
  if got = false then ok:=ok+1; else fails:=fails+1; det:=det||format(' [4 can_rate sin pagar = %s]', got); end if;

  -- 5 · El detalle trae el bloque rating con la misma regla.
  j := ketzal.get_my_trip(b_pas);
  if (j->'rating'->>'can_rate')::boolean = true and (j->'rating'->>'rated_provider')::boolean = false then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [5 rating del detalle (pasado): %s]', j->'rating'); end if;
  j := ketzal.get_my_trip(b_fut);
  -- 6
  if (j->'rating'->>'can_rate')::boolean = false then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [6 rating del detalle (futuro): %s]', j->'rating'); end if;

  -- 7 · La BD rechaza calificar un viaje futuro aunque la UI lo pidiera.
  begin
    perform ketzal.submit_rating(b_fut, 'traveler_to_provider', 5, 'adelantado');
    fails:=fails+1; det:=det||' [7 se aceptó calificar un viaje que no ha ocurrido]';
  exception when others then ok:=ok+1; end;
  -- 8 · …y uno sin fecha.
  begin
    perform ketzal.submit_rating(b_null, 'traveler_to_app', 5);
    fails:=fails+1; det:=det||' [8 se aceptó calificar un pedido sin fecha de viaje]';
  exception when others then ok:=ok+1; end;
  -- 9 · El viaje pasado sí se califica y el detalle lo refleja.
  begin
    perform ketzal.submit_rating(b_pas, 'traveler_to_provider', 5, 'Excelente');
    j := ketzal.get_my_trip(b_pas);
    if (j->'rating'->>'rated_provider')::boolean and (j->'rating'->>'provider_rating')::int = 5
       and j->'rating'->>'provider_comment' = 'Excelente' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [9 el detalle no refleja la reseña: %s]', j->'rating'); end if;
  exception when others then fails:=fails+1; det:=det||format(' [9 no se pudo calificar el viaje pasado: %s]', sqlerrm); end;

  ------------------------------------------------------------ otro viajero ---
  perform set_config('request.jwt.claims', json_build_object('sub', otro)::text, true);
  -- 10 · Otro viajero no ve el pedido ni puede calificarlo.
  j := ketzal.get_my_trip(b_pas);
  if j is null then ok:=ok+1; else fails:=fails+1; det:=det||' [10 otro viajero vio el viaje ajeno]'; end if;
  begin
    perform ketzal.submit_rating(b_pas, 'traveler_to_provider', 1, 'intruso');
    fails:=fails+1; det:=det||' [10b otro viajero calificó un viaje ajeno]';
  exception when others then ok:=ok+1; end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into n from ketzal.ratings where booking_id in (b_fut, b_pas, b_null, b_draft);
  -- 11 · Solo quedó la reseña legítima.
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [11 quedaron %s reseñas, esperaba 1]', n); end if;

  raise exception 'CALIFICAR -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
