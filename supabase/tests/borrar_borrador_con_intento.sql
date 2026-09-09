-- HARD TESTING — eliminar un borrador que abrió checkout (b105).
--
--   pnpm hard-test borrar_borrador_con_intento
--
-- Qué defiende: el viajero puede quitar de su lista un pedido pendiente aunque
-- haya abierto el checkout de Mercado Pago y no lo terminara. Antes
-- `delete_my_draft_order` bloqueaba con cualquier intento registrado y los
-- borradores se acumulaban. Ahora:
--   · sin intentos → se borra la fila (como siempre);
--   · con intentos MP → se CANCELA (la fila queda para que un pago tardío caiga
--     en la rama 'cancelled' de confirm_online_payment) y los intentos pendientes
--     quedan 'abandoned'; la lista del viajero lo esconde;
--   · con transferencia SPEI declarada → sigue bloqueado (pudo ya transferir);
--   · un approved tardío sobre el cancelado marca el intento, aplica 0 y deja
--     una notificación URGENT a los superadmins.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  ag        uuid := '0000b105-0000-4000-8000-00000000a001';
  svc       uuid := '0000b105-0000-4000-8000-00000000c001';
  viajero   uuid := '0000b105-0000-4000-8000-00000000d001';
  super_    uuid := '0000b105-0000-4000-8000-00000000d002';
  cli       uuid := '0000b105-0000-4000-8000-00000000b001';
  b_limpio  uuid := '0000b105-0000-4000-8000-00000000e001';  -- borrador sin intentos
  b_mp      uuid := '0000b105-0000-4000-8000-00000000e002';  -- borrador con checkout MP abierto
  b_spei    uuid := '0000b105-0000-4000-8000-00000000e003';  -- borrador con transferencia declarada
  i_mp      uuid := '0000b105-0000-4000-8000-00000000f001';
  i_mp2     uuid := '0000b105-0000-4000-8000-00000000f002';
  i_spei    uuid := '0000b105-0000-4000-8000-00000000f003';
  j jsonb; got text; n int;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag,'QA b105 Agencia','qa.b105.a@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag, 'QA b105 Tour', 50);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (viajero,'qa.b105.viajero@ketzal.local'), (super_,'qa.b105.super@ketzal.local')) as u(id, mail);
  insert into ketzal.profiles(id,email,name,role,type,active) values
    (viajero,'qa.b105.viajero@ketzal.local','QA b105 Viajero','user','viajero',true),
    (super_, 'qa.b105.super@ketzal.local',  'QA b105 Super',  'superadmin','agente',true);
  insert into ketzal.customers(id,supplier_id,full_name,marketplace_customer_id) values
    (cli, ag, 'QA b105 Viajero', viajero);
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel) values
    (b_limpio, ag, ag, cli, svc, viajero, 1, 50, 0, 50, 'draft', 'portal'),
    (b_mp,     ag, ag, cli, svc, viajero, 1, 50, 0, 50, 'draft', 'portal'),
    (b_spei,   ag, ag, cli, svc, viajero, 1, 50, 0, 50, 'draft', 'portal');
  insert into ketzal.payment_intents(id, booking_id, supplier_id, amount, currency, provider, status,
                                     marketplace_customer_id, split, mp_preference_id) values
    (i_mp,   b_mp,   ag, 50, 'MXN', 'mercadopago', 'pending', viajero, false, 'pref-qa-b105-1'),
    (i_mp2,  b_mp,   ag, 50, 'MXN', 'mercadopago', 'pending', viajero, false, 'pref-qa-b105-2'),
    (i_spei, b_spei, ag, 50, 'MXN', 'spei',        'pending', viajero, false, null);

  ------------------------------------------------------ como el viajero ---
  perform set_config('request.jwt.claims', json_build_object('sub', viajero)::text, true);
  perform set_config('role','authenticated',true);

  -- 1 · Sin intentos: se borra la fila.
  perform ketzal.delete_my_draft_order(b_limpio);
  if not exists (select 1 from ketzal.bookings where id = b_limpio) then ok:=ok+1;
  else fails:=fails+1; det:=det||' [1 el borrador limpio no se borró]'; end if;

  -- 2 · Con transferencia declarada: bloqueado, con mensaje que habla de la transferencia.
  begin
    perform ketzal.delete_my_draft_order(b_spei);
    fails:=fails+1; det:=det||' [2 se eliminó un borrador con SPEI en revisión]';
  exception when others then
    if sqlerrm ilike '%transferencia%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [2 bloqueó pero con el mensaje viejo: %s]', sqlerrm); end if;
  end;

  -- 3 · Con checkout MP abierto: ya no truena…
  begin
    perform ketzal.delete_my_draft_order(b_mp);
    ok:=ok+1;
  exception when others then fails:=fails+1; det:=det||format(' [3 sigue bloqueado: %s]', sqlerrm); end;
  -- Las lecturas de verificación van como postgres: la RLS del viajero no ve
  -- payment_intents y esconde lo que queremos comprobar.
  perform set_config('role','postgres',true);
  -- 4 · …la fila queda, cancelada (no borrada: la necesita un pago tardío).
  select status::text into got from ketzal.bookings where id = b_mp;
  if got = 'cancelled' then ok:=ok+1; else fails:=fails+1; det:=det||format(' [4 el borrador quedó %s]', coalesce(got,'BORRADO')); end if;
  -- 5 · …y sus intentos pendientes quedaron abandonados.
  select count(*) into n from ketzal.payment_intents where booking_id = b_mp and status = 'abandoned';
  if n = 2 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [5 %s intentos abandonados, esperaba 2]', n); end if;

  -- 6 · La lista del viajero ya no lo muestra (cancelado sin dinero) y sí muestra el de SPEI.
  perform set_config('role','authenticated',true);
  j := ketzal.list_my_marketplace_orders();
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'booking_id' = b_mp::text)
     and exists (select 1 from jsonb_array_elements(j) e where e->>'booking_id' = b_spei::text) then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [6 lista: %s]', (select string_agg(left(e->>'booking_id',8)||':'||(e->>'status'), ', ') from jsonb_array_elements(j) e)); end if;

  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims', null, true);

  -------------------------------------------------- pago tardío (webhook) ---
  -- 7 · MP aprueba tarde el checkout abandonado: no se pierde, cae en 'cancelled'.
  j := ketzal.confirm_online_payment(i_mp, 'mp-qa-b105-tardio', 'approved');
  if (j->>'ok')::boolean and (j->>'cancelled')::boolean and (j->>'applied')::numeric = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [7 confirm devolvió %s]', j); end if;
  -- 8 · El intento quedó approved con su mp_payment_id (rastro del dinero) y NO se creó pago.
  select status into got from ketzal.payment_intents where id = i_mp;
  select count(*) into n from ketzal.payments where booking_id = b_mp;
  if got = 'approved' and n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [8 intento=%s pagos=%s]', got, n); end if;
  -- 9 · El superadmin recibió la alerta URGENT con el pedido y el pago de MP.
  select count(*) into n from ketzal.notifications
   where user_id = super_ and priority = 'URGENT'
     and metadata->>'evento' = 'pago' and metadata->>'booking_id' = b_mp::text
     and metadata->>'mp_payment_id' = 'mp-qa-b105-tardio';
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [9 alertas al superadmin: %s]', n); end if;
  -- 10 · Un intento inexistente no se confunde con éxito.
  j := ketzal.confirm_online_payment('0000b105-0000-4000-8000-0000000000ff', 'mp-qa-x', 'approved');
  if (j->>'ok')::boolean = false and j->>'reason' = 'intent_not_found' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [10 intent inexistente devolvió %s]', j); end if;

  raise exception 'BORRADOR -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
