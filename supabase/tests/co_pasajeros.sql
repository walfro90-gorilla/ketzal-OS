-- HARD TESTING — quiénes van en mi viaje: proyección sin PII, gateada (ADR-0063, b107).
--
--   pnpm hard-test co_pasajeros
--
-- Qué defiende: `co_travelers` devuelve SOLO el perfil social (apodo, ciudad,
-- viaje soñado, bio, ruta de foto) de otros viajeros que comparten MI salida,
-- con pedido activo y `is_public` prendido; nunca email/teléfono/nombre; nunca
-- a mí; nunca privados, ni de otra fecha, ni en borrador, ni a quien reporté.
-- Niega con excepción (ADR-0037), no con lista vacía. `report_traveler` exige
-- compartir salida. `list_profile_reports` es solo superadmin.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.

do $$
declare
  ag    uuid := '0000b107-0000-4000-8000-00000000a001';
  svc   uuid := '0000b107-0000-4000-8000-00000000c001';
  sa    uuid := '0000b107-0000-4000-8000-00000000d000';  -- superadmin
  va    uuid := '0000b107-0000-4000-8000-00000000d001';  -- A: público, pregunta
  vb    uuid := '0000b107-0000-4000-8000-00000000d002';  -- B: público, misma salida
  vc    uuid := '0000b107-0000-4000-8000-00000000d003';  -- C: PRIVADO, misma salida
  ve    uuid := '0000b107-0000-4000-8000-00000000d004';  -- E: público, OTRA fecha
  vf    uuid := '0000b107-0000-4000-8000-00000000d005';  -- F: público, pedido en borrador
  ca uuid := '0000b107-0000-4000-8000-00000000b001'; cb uuid := '0000b107-0000-4000-8000-00000000b002';
  cc uuid := '0000b107-0000-4000-8000-00000000b003'; ce uuid := '0000b107-0000-4000-8000-00000000b004';
  cf uuid := '0000b107-0000-4000-8000-00000000b005';
  ba uuid := '0000b107-0000-4000-8000-00000000e001'; bb uuid := '0000b107-0000-4000-8000-00000000e002';
  bc uuid := '0000b107-0000-4000-8000-00000000e003'; be uuid := '0000b107-0000-4000-8000-00000000e004';
  bf uuid := '0000b107-0000-4000-8000-00000000e005';
  d date := current_date + 30;
  j jsonb; e jsonb; n int; k text;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag,'QA b107 Agencia','qa.b107.a@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values (svc, ag, 'QA b107 Tour', 1000);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (sa,'qa.b107.sa@ketzal.local'), (va,'qa.b107.a@ketzal.local'), (vb,'qa.b107.b@ketzal.local'),
               (vc,'qa.b107.c@ketzal.local'), (ve,'qa.b107.e@ketzal.local'), (vf,'qa.b107.f@ketzal.local')) as u(id, mail);
  insert into ketzal.profiles(id,email,name,phone,role,supplier_id,type,active,nickname,city,dream_trip,bio,is_public,social_photo_path) values
    (sa,'qa.b107.sa@ketzal.local','QA Super',null,'superadmin',null,'agente',true,null,null,null,null,false,null),
    (va,'qa.b107.a@ketzal.local','Ana Apellido','5210000001','user',null,'viajero',true,'Ana','Juárez','Patagonia','bio A',true,null),
    (vb,'qa.b107.b@ketzal.local','Beto Apellido','5210000002','user',null,'viajero',true,'Beto','Chihuahua','Islandia','bio B',true,
        'profiles/'||vb::text||'/social-1.jpg'),
    (vc,'qa.b107.c@ketzal.local','Caro Apellido','5210000003','user',null,'viajero',true,'Caro','Creel','Japón','bio C',false,null),
    (ve,'qa.b107.e@ketzal.local','Eli Apellido','5210000004','user',null,'viajero',true,'Eli','Parral','Perú','bio E',true,null),
    (vf,'qa.b107.f@ketzal.local','Fer Apellido','5210000005','user',null,'viajero',true,'Fer','Delicias','Egipto','bio F',true,null);
  insert into ketzal.customers(id,supplier_id,full_name,marketplace_customer_id) values
    (ca,ag,'Ana',va),(cb,ag,'Beto',vb),(cc,ag,'Caro',vc),(ce,ag,'Eli',ve),(cf,ag,'Fer',vf);
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel, travel_date) values
    (ba, ag, ag, ca, svc, va, 1, 1000, 0, 1000, 'reserved', 'portal', d),
    (bb, ag, ag, cb, svc, vb, 1, 1000, 0, 1000, 'paid',     'portal', d),
    (bc, ag, ag, cc, svc, vc, 1, 1000, 0, 1000, 'reserved', 'portal', d),
    (be, ag, ag, ce, svc, ve, 1, 1000, 0, 1000, 'paid',     'portal', d + 7),   -- otra fecha
    (bf, ag, ag, cf, svc, vf, 1, 1000, 0, 1000, 'draft',    'portal', d);       -- borrador

  ------------------------------------------------------ 1 · sin sesión ---
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role','authenticated',true);
  begin
    perform ketzal.co_travelers(ba);
    fails:=fails+1; det:=det||' [1 sin sesión vio la lista]';
  exception when others then ok:=ok+1; end;

  ------------------------------------------------------ como A (público) ---
  perform set_config('request.jwt.claims', json_build_object('sub', va)::text, true);
  j := ketzal.co_travelers(ba);

  -- 2 · Ve a B (público, misma salida, pagado) y SOLO a B.
  select count(*) into n from jsonb_array_elements(j);
  if n = 1 and j->0->>'id' = vb::text then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [2 A vio %s perfiles: %s]', n, j); end if;

  -- 3 · Lo que ve de B es EXACTAMENTE el perfil social: sin email/teléfono/nombre.
  e := j->0;
  if e->>'nickname' = 'Beto' and e->>'city' = 'Chihuahua' and e->>'dream_trip' = 'Islandia'
     and e->>'bio' = 'bio B' and e->>'photo_path' = 'profiles/'||vb::text||'/social-1.jpg' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [3 campos sociales de B: %s]', e); end if;
  select string_agg(x, ',') into k from jsonb_object_keys(e) x
    where x not in ('id','nickname','city','dream_trip','bio','photo_path');
  if k is null then ok:=ok+1; else fails:=fails+1; det:=det||format(' [3b llaves de más (PII?): %s]', k); end if;
  if (e ? 'email') or (e ? 'phone') or (e ? 'name') then fails:=fails+1; det:=det||' [3c PII en la proyección]';
  else ok:=ok+1; end if;

  -- 4 · No se ve a sí misma, ni a C (privada), ni a E (otra fecha), ni a F (borrador).
  select count(*) into n from jsonb_array_elements(j) x
    where x->>'id' in (va::text, vc::text, ve::text, vf::text);
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [4 se colaron %s de {yo,privado,otra fecha,borrador}]', n); end if;

  -- 5 · Un pedido que NO es mío niega con excepción (ADR-0037), no con [].
  begin
    perform ketzal.co_travelers(bb);
    fails:=fails+1; det:=det||' [5 A leyó co-pasajeros del pedido de B]';
  exception when others then ok:=ok+1; end;

  -- 6 · Reportarme a mí misma y reportar a quien no viaja conmigo: rechazados.
  begin
    perform ketzal.report_traveler(va, ba, 'x');
    fails:=fails+1; det:=det||' [6a me reporté a mí misma]';
  exception when others then ok:=ok+1; end;
  begin
    perform ketzal.report_traveler(ve, ba, 'x');
    fails:=fails+1; det:=det||' [6b reporté a alguien de otra fecha]';
  exception when others then ok:=ok+1; end;

  -- 7 · Reporto a B: desaparece para mí (y solo para mí).
  perform ketzal.report_traveler(vb, ba, 'contenido inapropiado');
  j := ketzal.co_travelers(ba);
  select count(*) into n from jsonb_array_elements(j) x where x->>'id' = vb::text;
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||' [7 B sigue visible tras reportarla]'; end if;

  -- 8 · La lista de reportes NO es para un viajero.
  begin
    perform ketzal.list_profile_reports();
    fails:=fails+1; det:=det||' [8 un viajero leyó los reportes]';
  exception when others then ok:=ok+1; end;

  ------------------------------------------------------ como B: A sigue viéndose ---
  perform set_config('request.jwt.claims', json_build_object('sub', vb)::text, true);
  j := ketzal.co_travelers(bb);
  select count(*) into n from jsonb_array_elements(j) x where x->>'id' = va::text;
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [9 el reporte de A ocultó a A para B: %s]', j); end if;

  ------------------------------------------------------ como E (otra fecha) ---
  perform set_config('request.jwt.claims', json_build_object('sub', ve)::text, true);
  j := ketzal.co_travelers(be);
  select count(*) into n from jsonb_array_elements(j) x where x->>'id' in (va::text, vb::text, vc::text);
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [10 E vio gente de otra fecha: %s]', j); end if;

  ------------------------------------------------------ como superadmin ---
  perform set_config('request.jwt.claims', json_build_object('sub', sa)::text, true);
  j := ketzal.list_profile_reports();
  select count(*) into n from jsonb_array_elements(j) x
    where x->>'reporter_id' = va::text and x->>'reported_id' = vb::text and x->>'reason' = 'contenido inapropiado';
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [11 el superadmin no ve el reporte: %s]', j); end if;

  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims', null, true);

  raise exception 'CO_PASAJEROS -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
