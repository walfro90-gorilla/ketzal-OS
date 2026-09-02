-- HARD TESTING — el ALCANCE de `ketzal.list_ambassadors()` (b089).
--
--   pnpm hard-test list_ambassadors_alcance
--
-- Qué defiende: quién ve a qué embajador. La versión anterior abría con
-- `if not ketzal.is_superadmin() then return '[]'`, así que un admin de agencia
-- recibía una lista VACÍA **sin error** — y los tres llamadores la tratan como
-- "no hay embajadores", no como "no tienes permiso". Consecuencia medida: en
-- /comisiones el admin no podía reemitir la contraseña de sus propios
-- embajadores (contra m005) y en /gastos/nuevo no podía nombrarlos para
-- registrar el pago de una comisión.
--
-- El contrato que se verifica aquí, caso por caso:
--   superadmin       → todos.
--   admin de agencia → los suyos + los que YA le vendieron (venta reserved/
--                      confirmed/paid; un draft con `?ref` no cuenta).
--   cualquier otro   → '[]' silencioso (incluida la cuenta inactiva).
--   toda fila trae `supplier_id`: la UI necesita distinguir "mío" (le puedo
--   reemitir el acceso) de "me vendió" (solo le debo dinero).
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. No
-- lee ni toca una sola fila real: crea sus agencias, su servicio y sus personas.

do $$
declare
  ag_a    uuid := '0000b089-0000-4000-8000-00000000a001';
  ag_b    uuid := '0000b089-0000-4000-8000-00000000a002';
  svc     uuid := '0000b089-0000-4000-8000-00000000b001';
  cli     uuid := '0000b089-0000-4000-8000-00000000c001';

  sadmin  uuid := '0000b089-0000-4000-8000-00000000d001';  -- superadmin
  admin_a uuid := '0000b089-0000-4000-8000-00000000d002';  -- admin de ag_a
  agente  uuid := '0000b089-0000-4000-8000-00000000d003';  -- agente raso de ag_a
  viajero uuid := '0000b089-0000-4000-8000-00000000d004';
  muerto  uuid := '0000b089-0000-4000-8000-00000000d005';  -- admin de ag_a INACTIVO

  emb_a   uuid := '0000b089-0000-4000-8000-00000000e001';  -- embajador de ag_a
  emb_b   uuid := '0000b089-0000-4000-8000-00000000e002';  -- embajador de ag_b
  emb_kz  uuid := '0000b089-0000-4000-8000-00000000e003';  -- directo de Ketzal

  b uuid; n int; got jsonb;
  ok int := 0; fails int := 0; det text := '';

begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type) values
    (ag_a,'QA b089 Agencia A','qa.b089.a@ketzal.local','agency'),
    (ag_b,'QA b089 Agencia B','qa.b089.b@ketzal.local','agency');
  insert into ketzal.services(id,supplier_id,name,price) values
    (svc, ag_a, 'QA b089 Tour', 5000);
  insert into ketzal.customers(id,supplier_id,full_name) values (cli,ag_a,'QA b089 Cliente');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (sadmin,'qa.b089.sadmin@ketzal.local'), (admin_a,'qa.b089.admin@ketzal.local'),
               (agente,'qa.b089.agente@ketzal.local'), (viajero,'qa.b089.viajero@ketzal.local'),
               (muerto,'qa.b089.muerto@ketzal.local'), (emb_a,'qa.b089.emba@ketzal.local'),
               (emb_b,'qa.b089.embb@ketzal.local'),   (emb_kz,'qa.b089.embkz@ketzal.local')
       ) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active,referral_code) values
    (sadmin, 'qa.b089.sadmin@ketzal.local','QA b089 Super', 'superadmin', null,'agente',   true, null),
    (admin_a,'qa.b089.admin@ketzal.local', 'QA b089 AdminA','admin',      ag_a,'agente',   true, null),
    (agente, 'qa.b089.agente@ketzal.local','QA b089 Agente','user',       ag_a,'agente',   true, null),
    (viajero,'qa.b089.viajero@ketzal.local','QA b089 Viaj','user',        null,'viajero',  true, null),
    (muerto, 'qa.b089.muerto@ketzal.local','QA b089 Muerto','admin',      ag_a,'agente',   false,null),
    (emb_a,  'qa.b089.emba@ketzal.local',  'QA b089 EmbA',  'user',       ag_a,'embajador',true,'QAB089A'),
    (emb_b,  'qa.b089.embb@ketzal.local',  'QA b089 EmbB',  'user',       ag_b,'embajador',true,'QAB089B'),
    (emb_kz, 'qa.b089.embkz@ketzal.local', 'QA b089 EmbKZ', 'user',       null,'embajador',true,'QAB089K');

  ------------------------------------------------------------------ casos ---
  -- 1 · El SUPERADMIN ve a los tres.
  perform set_config('request.jwt.claims',
    json_build_object('sub',sadmin,'role','authenticated')::text, true);
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' in (emb_a::text, emb_b::text, emb_kz::text);
  if n = 3 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [1 el superadmin vio %s de 3 embajadores]',n); end if;

  -- 2 · El ADMIN DE AGENCIA ve al SUYO. Este es el bug que motivó b089: antes
  --     recibía '[]' y "Accesos" salía vacío.
  perform set_config('request.jwt.claims',
    json_build_object('sub',admin_a,'role','authenticated')::text, true);
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_a::text;
  if n = 1 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [2 el admin de agencia NO ve a su propio embajador]'; end if;

  -- 3 · ...y NO ve al de la otra agencia (ADR-0004: tenencia por supplier_id).
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_b::text;
  if n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [3 el admin de A ve al embajador de B]'; end if;

  -- 4 · ...ni al directo de Ketzal MIENTRAS no le haya vendido nada.
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_kz::text;
  if n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [4 ve a un embajador ajeno que nunca le vendió]'; end if;

  -- 5 · Toda fila trae `supplier_id`: sin él la UI no puede distinguir al que
  --     administra del que solo le vendió, y ofrecería un botón que falla.
  select e into got from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_a::text;
  if got ? 'supplier_id' and got->>'supplier_id' = ag_a::text then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [5 la fila no trae supplier_id útil: %s]',got); end if;

  -- 6 · Un DRAFT con `?ref` no convierte a nadie en beneficiario.
  perform set_config('request.jwt.claims', null, true);
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,emb_b,1,5000,0,5000,'draft','portal');
  perform set_config('request.jwt.claims',
    json_build_object('sub',admin_a,'role','authenticated')::text, true);
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_b::text;
  if n = 0 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [6 una cotización abandonada metió al embajador en la lista]'; end if;

  -- 7 · Una VENTA de verdad sí lo mete: la agencia le debe dinero y tiene que
  --     poder nombrarlo al registrar el gasto (ADR-0021, modelo sin límite).
  perform set_config('request.jwt.claims', null, true);
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,emb_kz,1,5000,0,5000,'reserved','portal');
  perform set_config('request.jwt.claims',
    json_build_object('sub',admin_a,'role','authenticated')::text, true);
  select count(*) into n from jsonb_array_elements(ketzal.list_ambassadors()) e
   where e->>'id' = emb_kz::text;
  if n = 1 then ok:=ok+1;
  else fails:=fails+1; det:=det||' [7 el embajador que YA le vendió sigue invisible]'; end if;

  -- 8 · Un agente RASO de la agencia no administra a nadie.
  perform set_config('request.jwt.claims',
    json_build_object('sub',agente,'role','authenticated')::text, true);
  if ketzal.list_ambassadors() = '[]'::jsonb then ok:=ok+1;
  else fails:=fails+1; det:=det||' [8 un agente no-admin recibe la lista de embajadores]'; end if;

  -- 9 · El viajero tampoco.
  perform set_config('request.jwt.claims',
    json_build_object('sub',viajero,'role','authenticated')::text, true);
  if ketzal.list_ambassadors() = '[]'::jsonb then ok:=ok+1;
  else fails:=fails+1; det:=det||' [9 un viajero recibe la lista de embajadores]'; end if;

  -- 10 · Cuenta pendiente de aprobación: '[]', aunque su rol diga admin.
  perform set_config('request.jwt.claims',
    json_build_object('sub',muerto,'role','authenticated')::text, true);
  if ketzal.list_ambassadors() = '[]'::jsonb then ok:=ok+1;
  else fails:=fails+1; det:=det||' [10 una cuenta inactiva con rol admin ve embajadores]'; end if;

  -- 11 · Sin sesión (anon): '[]'. Nunca una lista de personas.
  perform set_config('request.jwt.claims', null, true);
  if ketzal.list_ambassadors() = '[]'::jsonb then ok:=ok+1;
  else fails:=fails+1; det:=det||' [11 sin sesión se listan embajadores]'; end if;

  if ok = 0 then
    raise exception 'ALCANCE DE list_ambassadors -- 0 casos corrieron: verde vacío.';
  end if;
  raise exception 'ALCANCE DE list_ambassadors -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
