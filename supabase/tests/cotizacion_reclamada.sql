-- HARD TESTING — la cotización del back-office se GUARDA en una cuenta de
-- viajero (b091, ADR-0039).
--
--   pnpm hard-test cotizacion_reclamada
--
-- Qué defiende:
--   · `claim_quote(token)`: quien tiene el link se lleva ESA cotización; el
--     primero gana, el segundo recibe error (no silencio); idempotente para el
--     dueño; cancelada e inexistente fallan; anon falla.
--   · `link_my_customers()`: liga por correo SOLO si el correo está verificado
--     (confirmación enviada de verdad o identidad Google `email_verified`); una
--     cuenta auto-confirmada NO liga aunque el correo coincida. Una fila por
--     agencia (la más antigua), sin chocar con `uq_customers_supplier_marketplace`,
--     case-insensitive, idempotente.
--   · La venta de canal `manual` es SOLO LECTURA en el portal: `delete_my_draft_order`,
--     `create_marketplace_payment_intent`, `submit_spei_payment`,
--     `generate_marketplace_payment_plan` y `puedo_subir_comprobante` la rechazan;
--     la del portal sigue funcionando igual (regresión).
--   · `list_my_marketplace_orders` / `get_my_trip` la devuelven con `channel`.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. No
-- lee ni toca una sola fila real: crea sus agencias, servicio, personas y ventas.

do $$
declare
  ag_a     uuid := '0000b091-0000-4000-8000-00000000a001';
  ag_b     uuid := '0000b091-0000-4000-8000-00000000a002';
  svc      uuid := '0000b091-0000-4000-8000-00000000b001';

  -- clientes del back-office
  cli_tok   uuid := '0000b091-0000-4000-8000-00000000c001';  -- sin correo; se reclama por token
  cli_mail  uuid := '0000b091-0000-4000-8000-00000000c002';  -- correo M, ag_a, la más antigua
  cli_mail2 uuid := '0000b091-0000-4000-8000-00000000c003';  -- correo M, ag_a, duplicada
  cli_b     uuid := '0000b091-0000-4000-8000-00000000c004';  -- correo M en MAYÚSCULAS, ag_b
  cli_canc  uuid := '0000b091-0000-4000-8000-00000000c005';
  cli_other uuid := '0000b091-0000-4000-8000-00000000c006';  -- ya ligado a OTRO perfil (v_goog)
  cli_x     uuid := '0000b091-0000-4000-8000-00000000c007';  -- choca con el índice único
  cli_auto  uuid := '0000b091-0000-4000-8000-00000000c008';  -- correo de la cuenta auto-confirmada
  cli_goog  uuid := '0000b091-0000-4000-8000-00000000c009';  -- correo de la cuenta Google

  -- perfiles de viajero
  v_ver  uuid := '0000b091-0000-4000-8000-00000000d001';  -- correo M, confirmado tras envío real
  v_auto uuid := '0000b091-0000-4000-8000-00000000d002';  -- auto-confirmado (sin envío)
  v_goog uuid := '0000b091-0000-4000-8000-00000000d003';  -- identidad Google email_verified

  -- ventas manuales (con quote_token)
  b_tok      uuid := '0000b091-0000-4000-8000-00000000e001';
  b_mail     uuid := '0000b091-0000-4000-8000-00000000e002';
  b_mail_old uuid := '0000b091-0000-4000-8000-00000000e003';
  b_dup      uuid := '0000b091-0000-4000-8000-00000000e004';
  b_b        uuid := '0000b091-0000-4000-8000-00000000e005';
  b_canc     uuid := '0000b091-0000-4000-8000-00000000e006';
  b_other    uuid := '0000b091-0000-4000-8000-00000000e007';
  b_x        uuid := '0000b091-0000-4000-8000-00000000e008';
  b_portal   uuid := '0000b091-0000-4000-8000-00000000e009';

  tok_tok   uuid := '0000b091-0000-4000-8000-00000000f001';
  tok_canc  uuid := '0000b091-0000-4000-8000-00000000f006';
  tok_other uuid := '0000b091-0000-4000-8000-00000000f007';
  tok_x     uuid := '0000b091-0000-4000-8000-00000000f008';
  tok_nada  uuid := '0000b091-0000-4000-8000-00000000f0ff';

  got uuid; j jsonb; n int; b boolean;
  ok int := 0; fails int := 0; det text := '';

begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag_a,'QA b091 Agencia A','qa.b091.a@ketzal.local','agency'),
    (ag_b,'QA b091 Agencia B','qa.b091.b@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag_a, 'QA b091 Tour', 5000);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, created_at, updated_at, confirmation_token,
    recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')), now(), u.sent, now(), now(), '','','','','','','',''
  from (values
    (v_ver,  'qa.b091.mail@ketzal.local', now()),          -- confirmación ENVIADA y confirmada
    (v_auto, 'qa.b091.auto@ketzal.local', null::timestamptz), -- auto-confirmada (Admin API / Confirm email off)
    (v_goog, 'qa.b091.goog@ketzal.local', null::timestamptz)  -- auto-confirmada, pero con Google
  ) as u(id, mail, sent);
  insert into auth.identities(id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_goog, 'qa-b091-goog', 'google',
          jsonb_build_object('sub','qa-b091-goog','email','qa.b091.goog@ketzal.local','email_verified',true),
          now(), now(), now());

  insert into ketzal.profiles(id,email,name,role,type,active) values
    (v_ver,  'qa.b091.mail@ketzal.local','QA b091 Verificado','user','viajero',true),
    (v_auto, 'qa.b091.auto@ketzal.local','QA b091 Auto',      'user','viajero',true),
    (v_goog, 'qa.b091.goog@ketzal.local','QA b091 Google',    'user','viajero',true);

  insert into ketzal.customers(id,supplier_id,full_name,email,marketplace_customer_id,created_at) values
    (cli_tok,   ag_a, 'QA b091 Token',    null,                          null,  now()),
    (cli_mail,  ag_a, 'QA b091 Mail',     'qa.b091.mail@ketzal.local',   null,  now() - interval '2 days'),
    (cli_mail2, ag_a, 'QA b091 Mail dup', 'qa.b091.mail@ketzal.local',   null,  now() - interval '1 day'),
    (cli_b,     ag_b, 'QA b091 Mail B',   'QA.B091.MAIL@ketzal.local',   null,  now()),
    (cli_canc,  ag_a, 'QA b091 Canc',     null,                          null,  now()),
    (cli_other, ag_a, 'QA b091 Ajeno',    null,                          v_goog, now()),
    (cli_x,     ag_a, 'QA b091 Choque',   null,                          null,  now()),
    (cli_auto,  ag_a, 'QA b091 Auto',     'qa.b091.auto@ketzal.local',   null,  now()),
    (cli_goog,  ag_b, 'QA b091 Google',   'qa.b091.goog@ketzal.local',   null,  now());

  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              num_pax, subtotal, discount, total, status, channel, quote_token) values
    (b_tok,      ag_a, ag_a, cli_tok,   svc, 2, 10000, 0, 10000, 'draft',     'manual', tok_tok),
    (b_mail,     ag_a, ag_a, cli_mail,  svc, 1,  5000, 0,  5000, 'reserved',  'manual', gen_random_uuid()),
    (b_mail_old, ag_a, ag_a, cli_mail,  svc, 1,  5000, 0,  5000, 'paid',      'manual', gen_random_uuid()),
    (b_dup,      ag_a, ag_a, cli_mail2, svc, 1,  5000, 0,  5000, 'draft',     'manual', gen_random_uuid()),
    (b_b,        ag_b, ag_a, cli_b,     svc, 1,  5000, 0,  5000, 'reserved',  'manual', gen_random_uuid()),
    (b_canc,     ag_a, ag_a, cli_canc,  svc, 1,  5000, 0,  5000, 'cancelled', 'manual', tok_canc),
    (b_other,    ag_a, ag_a, cli_other, svc, 1,  5000, 0,  5000, 'draft',     'manual', tok_other),
    (b_x,        ag_a, ag_a, cli_x,     svc, 1,  5000, 0,  5000, 'draft',     'manual', tok_x);

  ------------------------------------------------------------------ casos ---
  -- 1 · ANÓNIMO no reclama.
  perform set_config('request.jwt.claims', '', true);
  begin
    perform ketzal.claim_quote(tok_tok);
    fails:=fails+1; det:=det||' [1 anon reclamó]';
  exception when others then
    if sqlerrm like '%No autenticado%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [1 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 2 · Quien TIENE el link se lleva la cotización (aunque su correo no esté
  --     verificado: el token es la prueba). Liga booking y cliente.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_auto,'role','authenticated')::text, true);
  got := ketzal.claim_quote(tok_tok);
  if got = b_tok
     and (select marketplace_customer_id from ketzal.bookings  where id = b_tok)   = v_auto
     and (select marketplace_customer_id from ketzal.customers where id = cli_tok) = v_auto
  then ok:=ok+1;
  else fails:=fails+1; det:=det||' [2 el token no ligó booking+cliente]'; end if;

  -- 3 · Reclamar dos veces es idempotente.
  got := ketzal.claim_quote(tok_tok);
  if got = b_tok then ok:=ok+1; else fails:=fails+1; det:=det||' [3 no idempotente]'; end if;

  -- 4 · Un segundo perfil recibe ERROR explícito, no silencio.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_ver,'role','authenticated')::text, true);
  begin
    perform ketzal.claim_quote(tok_tok);
    fails:=fails+1; det:=det||' [4 el segundo perfil se la llevó]';
  exception when others then
    if sqlerrm like '%otra cuenta%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [4 error inesperado: %s]', sqlerrm); end if;
  end;
  if (select marketplace_customer_id from ketzal.bookings where id = b_tok) = v_auto then ok:=ok+1;
  else fails:=fails+1; det:=det||' [4b el dueño cambió]'; end if;

  -- 5 · Cancelada: no se guarda.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_auto,'role','authenticated')::text, true);
  begin
    perform ketzal.claim_quote(tok_canc);
    fails:=fails+1; det:=det||' [5 cancelada aceptada]';
  exception when others then
    if sqlerrm like '%no está disponible%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [5 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 6 · Token inexistente.
  begin
    perform ketzal.claim_quote(tok_nada);
    fails:=fails+1; det:=det||' [6 token inventado aceptado]';
  exception when others then
    if sqlerrm like '%no encontrada%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [6 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 7 · Aparece en /mis-compras con channel='manual'.
  j := ketzal.list_my_marketplace_orders();
  select count(*) into n from jsonb_array_elements(j) e
   where e->>'booking_id' = b_tok::text and e->>'channel' = 'manual';
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [7 list_my_marketplace_orders: %s]', j); end if;

  -- 8 · El detalle también dice el canal.
  j := ketzal.get_my_trip(b_tok);
  if j->'booking'->>'channel' = 'manual' then ok:=ok+1;
  else fails:=fails+1; det:=det||' [8 get_my_trip sin channel]'; end if;

  -- 9 · SOLO LECTURA: no puede borrar la cotización del agente.
  begin
    perform ketzal.delete_my_draft_order(b_tok);
    fails:=fails+1; det:=det||' [9 borró el draft del agente]';
  exception when others then
    if sqlerrm like '%lleva tu agencia%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [9 error inesperado: %s]', sqlerrm); end if;
  end;
  if exists (select 1 from ketzal.bookings where id = b_tok) then ok:=ok+1;
  else fails:=fails+1; det:=det||' [9b el draft desapareció]'; end if;

  -- 10 · Ni pagar por MP …
  begin
    perform ketzal.create_marketplace_payment_intent(b_tok, 1000);
    fails:=fails+1; det:=det||' [10 creó intent MP en venta manual]';
  exception when others then
    if sqlerrm like '%lleva tu agencia%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [10 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 11 · … ni por SPEI (el gate va ANTES de la CLABE) …
  begin
    perform ketzal.submit_spei_payment(b_tok, 1000, 'ref', 'https://x/comprobante.jpg');
    fails:=fails+1; det:=det||' [11 registró SPEI en venta manual]';
  exception when others then
    if sqlerrm like '%lleva tu agencia%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [11 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 12 · … ni regenerar el plan de pagos del agente …
  begin
    perform ketzal.generate_marketplace_payment_plan(b_tok, 'mensual', current_date + 60);
    fails:=fails+1; det:=det||' [12 regeneró el plan en venta manual]';
  exception when others then
    if sqlerrm like '%lleva tu agencia%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [12 error inesperado: %s]', sqlerrm); end if;
  end;

  -- 13 · … ni subir comprobante (guard de Storage).
  b := ketzal.puedo_subir_comprobante(b_tok);
  if b = false then ok:=ok+1; else fails:=fails+1; det:=det||' [13 puedo_subir_comprobante=true en manual]'; end if;

  -- 14 · REGRESIÓN: un pedido del PORTAL sigue borrándose y aceptando comprobante.
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel)
  values (b_portal, ag_a, ag_a, cli_tok, svc, v_auto, 1, 5000, 0, 5000, 'draft', 'portal');
  b := ketzal.puedo_subir_comprobante(b_portal);
  perform ketzal.delete_my_draft_order(b_portal);
  if b and not exists (select 1 from ketzal.bookings where id = b_portal) then ok:=ok+1;
  else fails:=fails+1; det:=det||' [14 el pedido del portal dejó de funcionar]'; end if;

  -- 15 · Token de una cotización cuyo CLIENTE ya es de otro perfil: se liga el
  --      booking (el link lo tiene quien lo tiene), el cliente no se roba.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_auto,'role','authenticated')::text, true);
  got := ketzal.claim_quote(tok_other);
  if got = b_other
     and (select marketplace_customer_id from ketzal.bookings  where id = b_other)   = v_auto
     and (select marketplace_customer_id from ketzal.customers where id = cli_other) = v_goog
  then ok:=ok+1;
  else fails:=fails+1; det:=det||' [15 se robó el cliente ajeno o no ligó el booking]'; end if;

  -- 16 · Índice único: v_auto ya tiene cliente en ag_a (cli_tok); reclamar otra
  --      cotización de ag_a liga el booking y deja el cliente sin ligar.
  got := ketzal.claim_quote(tok_x);
  if got = b_x
     and (select marketplace_customer_id from ketzal.bookings  where id = b_x)   = v_auto
     and (select marketplace_customer_id from ketzal.customers where id = cli_x) is null
  then ok:=ok+1;
  else fails:=fails+1; det:=det||' [16 el índice único no se respetó]'; end if;

  -- 17 · Correo AUTO-CONFIRMADO no liga aunque coincida (falla cerrado).
  n := ketzal.link_my_customers();
  if n = 0 and (select marketplace_customer_id from ketzal.customers where id = cli_auto) is null then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [17 auto-confirmado ligó %s]', n); end if;

  -- 18 · Correo VERIFICADO liga: una fila por agencia (la más antigua), en
  --      mayúsculas también, y arrastra sus ventas; la duplicada queda fuera.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_ver,'role','authenticated')::text, true);
  n := ketzal.link_my_customers();
  if n = 2
     and (select marketplace_customer_id from ketzal.customers where id = cli_mail)  = v_ver
     and (select marketplace_customer_id from ketzal.customers where id = cli_b)     = v_ver
     and (select marketplace_customer_id from ketzal.customers where id = cli_mail2) is null
     and (select marketplace_customer_id from ketzal.bookings  where id = b_mail)     = v_ver
     and (select marketplace_customer_id from ketzal.bookings  where id = b_mail_old) = v_ver
     and (select marketplace_customer_id from ketzal.bookings  where id = b_b)        = v_ver
     and (select marketplace_customer_id from ketzal.bookings  where id = b_dup)      is null
  then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [18 link por correo ligó %s; mail=%s b=%s dup=%s]', n,
    (select marketplace_customer_id from ketzal.customers where id = cli_mail),
    (select marketplace_customer_id from ketzal.customers where id = cli_b),
    (select marketplace_customer_id from ketzal.customers where id = cli_mail2)); end if;

  -- 19 · Idempotente.
  n := ketzal.link_my_customers();
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [19 segunda pasada ligó %s]', n); end if;

  -- 20 · Sus ventas ya salen en /mis-compras; la de la duplicada no.
  j := ketzal.list_my_marketplace_orders();
  select count(*) into n from jsonb_array_elements(j) e
   where e->>'booking_id' in (b_mail::text, b_mail_old::text, b_b::text);
  if n = 3 and not exists (select 1 from jsonb_array_elements(j) e where e->>'booking_id' = b_dup::text) then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [20 mis-compras del verificado: %s de 3]', n); end if;

  -- 21 · Identidad Google con email_verified cuenta como verificado.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_goog,'role','authenticated')::text, true);
  n := ketzal.link_my_customers();
  if n = 1 and (select marketplace_customer_id from ketzal.customers where id = cli_goog) = v_goog then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [21 Google ligó %s]', n); end if;

  -- 22 · Los RPC del viajero NO abren la puerta a nadie más: otro perfil no ve
  --      la cotización reclamada por v_auto.
  perform set_config('request.jwt.claims',
    json_build_object('sub',v_goog,'role','authenticated')::text, true);
  if ketzal.get_my_trip(b_tok) is null then ok:=ok+1;
  else fails:=fails+1; det:=det||' [22 otro perfil vio la cotización]'; end if;

  ------------------------------------------------------------------ cierre ---
  if ok = 0 then
    raise exception 'HARD-TEST cotizacion_reclamada: 0 casos corrieron: verde vacío.';
  end if;
  raise exception 'HARD-TEST cotizacion_reclamada: % pasaron, % fallaron.%', ok, fails,
    case when fails > 0 then ' Detalle:' || det else ' (rollback)' end;
end $$;
