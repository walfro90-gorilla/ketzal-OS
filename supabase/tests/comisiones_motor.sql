-- HARD TESTING — la MATRIZ del motor de comisiones.
--
--   pnpm hard-test comisiones_motor
--
-- Qué defiende: que por cada combinación de (canal × quién trae la venta × cómo
-- paga × cómo termina) se devengue exactamente lo que debe, a quien debe. Es el
-- único harness que cruza los CUATRO payee_type en una pasada; el resto los
-- prueba sueltos y ninguno los ve interactuar.
--
-- ── Por qué se reescribió (2026-09-01) ───────────────────────────────────────
-- La versión anterior llevaba meses rota y nadie lo sabía, porque nada la
-- corría (ADR-0034). Estaba escrita contra un modelo que ya no existe:
--   · insertaba en `ketzal.marketplace_customers`, tabla ELIMINADA en el
--     refactor de identidad (b025). Ahí moría en la primera línea.
--   · trataba al embajador como una fila de `suppliers` con
--     supplier_type='embajador'; desde b026 es un `profiles` con type='embajador'
--     y su tarifa se scopea por `scope_profile_id`.
--   · tomaba al comprador con `select id from auth.users limit 1` — una cuenta
--     REAL al azar.
--   · esperaba que `set_booking_ambassador` lanzara excepción por tarifa
--     inválida o comisión que excede la venta. **Ya no lanza**: b079 movió esa
--     lógica al trigger, que en vez de abortar registra el motivo en
--     `referral_misses`. El harness probaba un contrato muerto.
--   · daba por hecho que la comisión de plataforma la dispara la venta "libre"
--     (`selling_supplier_id is null`). Hoy la dispara `channel='portal'`.
--
-- ── El contrato vivo que se verifica (leído del trigger, no supuesto) ────────
-- `tg_commission_snapshot` corre AFTER INSERT OR UPDATE OF status, ambassador_id
-- y solo con status in (reserved, confirmed, paid). Cuatro bloques independientes:
--   1 plataforma → si channel='portal'. Sin regla propia cae al global de
--     `app_settings.platform_commission_rate`.
--   2 agencia    → si hay reventa (owner <> selling). Cobra el REVENDEDOR
--     (`selling_supplier_id`) con la tarifa de la agencia DUEÑA.
--   3 agente     → si sold_by y selling_supplier_id no son null.
--   4 embajador  → si ambassador_id no es null; si no hay tarifa, si da cero, o
--     si excede la venta, NO devenga y deja `referral_misses` con el motivo.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. No
-- toca ni lee una sola fila real: crea sus agencias, su servicio y sus personas.

do $$
declare
  -- Agencias, catálogo y personas: todo propio del harness.
  ag_a    uuid := '0000c011-0000-4000-8000-00000000a001';  -- dueña del viaje
  ag_b    uuid := '0000c011-0000-4000-8000-00000000a002';  -- revendedora
  ag_c    uuid := '0000c011-0000-4000-8000-00000000a003';  -- sin tarifa de embajador
  svc     uuid := '0000c011-0000-4000-8000-00000000b001';
  svc_sin uuid := '0000c011-0000-4000-8000-00000000b002';  -- servicio de ag_c
  cli     uuid := '0000c011-0000-4000-8000-00000000c001';
  emb     uuid := '0000c011-0000-4000-8000-00000000d001';  -- embajador
  agente  uuid := '0000c011-0000-4000-8000-00000000d002';  -- agente de ag_a
  viajero uuid := '0000c011-0000-4000-8000-00000000d003';  -- comprador del portal
  admin_a uuid := '0000c011-0000-4000-8000-00000000d004';  -- admin de ag_a

  PAX  constant int := 2;
  TOT  constant numeric := 10000;   -- venta normal
  CHICA constant numeric := 100;    -- venta donde la comisión no cabe

  b uuid; n int; s numeric; got text;
  ok int := 0; fails int := 0; det text := '';

  -- Cada caso reporta con esto: deja el detalle en `det` solo si falla.
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate) values
    (ag_a,'QA Motor A (dueña)','qa.motor.a@ketzal.local','agency',12),
    (ag_b,'QA Motor B (revende)','qa.motor.b@ketzal.local','agency',0),
    (ag_c,'QA Motor C (sin tarifa emb)','qa.motor.c@ketzal.local','agency',0);
  insert into ketzal.services(id,supplier_id,name,price) values
    (svc,     ag_a,'QA Motor Tour',     5000),
    (svc_sin, ag_c,'QA Motor Tour C',   5000);
  insert into ketzal.customers(id,supplier_id,full_name) values (cli,ag_a,'QA Motor Cliente');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (emb,'qa.motor.emb@ketzal.local'), (agente,'qa.motor.agente@ketzal.local'),
               (viajero,'qa.motor.viajero@ketzal.local'), (admin_a,'qa.motor.admin@ketzal.local')
       ) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active,referral_code) values
    (emb,    'qa.motor.emb@ketzal.local',    'QA Emb',    'user', null,'embajador',true,'QAMOTOR1'),
    (agente, 'qa.motor.agente@ketzal.local', 'QA Agente', 'user', ag_a,'agente',   true, null),
    (viajero,'qa.motor.viajero@ketzal.local','QA Viajero','user', null,'viajero',  true, null),
    (admin_a,'qa.motor.admin@ketzal.local',  'QA Admin A','admin',ag_a,'agente',   true, null);

  -- Tarifas. La de plataforma NO se crea a propósito: debe caer al global de
  -- app_settings, que es como funciona hoy en producción.
  insert into ketzal.commission_rules(payee_type,scope_supplier_id,basis,unit_amount,active)
    values ('embajador', ag_a, 'fijo_pax', 250, true);     -- ag_c queda sin tarifa
  insert into ketzal.commission_rules(payee_type,scope_profile_id,basis,rate,unit_amount,active)
    values ('agente', agente, 'hibrido', 0, 300, true);

  -- Helper inline: crea una venta con la forma pedida y devuelve su id.
  -- (Se hace por INSERT directo y no por RPC para poder fijar canal, dueño,
  --  revendedor y vendedor de forma independiente: es justo la matriz.)

  ------------------------------------------------------------ CANAL × QUIÉN --
  -- 1 · Venta directa de la agencia dueña, sin nadie que la traiga ⇒ NADA.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,PAX,TOT,0,TOT,'reserved','manual');
  select count(*) into n from ketzal.commission_lines where booking_id=b;
  if n=0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [1 directa devengó %s líneas y no debía]',n); end if;

  -- 2 · REVENTA: cobra el revendedor (ag_b) con la tarifa de la dueña (12%).
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              num_pax,subtotal,discount,total,status,channel)
    values (b,ag_b,ag_a,cli,svc,PAX,TOT,0,TOT,'reserved','manual');
  select count(*), coalesce(sum(amount_mxn),0) into n,s
    from ketzal.commission_lines where booking_id=b and payee_type='agencia' and payee_supplier_id=ag_b;
  if n=1 and s=TOT*0.12 then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [2 reventa: %s líneas, $%s (esperado 1 y $%s)]',n,s,TOT*0.12); end if;

  -- 3 · PORTAL: corte de Ketzal por el global de app_settings (hoy 10%).
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              marketplace_customer_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,viajero,PAX,TOT,0,TOT,'reserved','portal');
  select count(*), coalesce(sum(amount_mxn),0) into n,s
    from ketzal.commission_lines where booking_id=b and payee_type='plataforma';
  if n=1 and s = TOT * (select platform_commission_rate from ketzal.app_settings where id=1)/100
  then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [3 portal: %s líneas de plataforma, $%s]',n,s); end if;

  -- 4 · Lo que el back-office vende NO paga corte de plataforma (ADR: el corte
  --     es solo del portal). Mismo caso que 1, pero afirmando el negativo.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,PAX,TOT,0,TOT,'reserved','manual');
  select count(*) into n from ketzal.commission_lines where booking_id=b and payee_type='plataforma';
  if n=0 then ok:=ok+1; else fails:=fails+1; det:=det||' [4 la venta manual pagó corte de plataforma]'; end if;

  -- 5 · AGENTE: híbrido 0% + $300/pax ⇒ $600.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              sold_by,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,agente,PAX,TOT,0,TOT,'reserved','manual');
  select count(*), coalesce(sum(amount_mxn),0) into n,s
    from ketzal.commission_lines where booking_id=b and payee_type='agente' and payee_profile_id=agente;
  if n=1 and s=300*PAX then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [5 agente: %s líneas, $%s (esperado 1 y $%s)]',n,s,300*PAX); end if;

  -- 6 · EMBAJADOR: $250/pax de la agencia dueña ⇒ $500.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,emb,PAX,TOT,0,TOT,'reserved','manual');
  select count(*), coalesce(sum(amount_mxn),0) into n,s
    from ketzal.commission_lines where booking_id=b and payee_type='embajador' and payee_profile_id=emb;
  if n=1 and s=250*PAX then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [6 embajador: %s líneas, $%s (esperado 1 y $%s)]',n,s,250*PAX); end if;

  -- 7 · LOS TRES JUNTOS sobre una venta del portal: plataforma + agente +
  --     embajador conviven sin pisarse. Es el caso que ningún harness veía.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              marketplace_customer_id,sold_by,ambassador_id,
                              num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,viajero,agente,emb,PAX,TOT,0,TOT,'reserved','portal');
  select string_agg(payee_type||'='||amount_mxn, ' ' order by payee_type) into got
    from ketzal.commission_lines where booking_id=b;
  if got = 'agente=600.00 embajador=500.00 plataforma=1000.00' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [7 los tres juntos dieron «%s»]',coalesce(got,'nada')); end if;

  ------------------------------------------------- POR QUÉ NO COBRA EL EMB ---
  -- 8 · La agencia dueña no fijó tarifa ⇒ no devenga y queda el motivo.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_c,ag_c,cli,svc_sin,emb,PAX,TOT,0,TOT,'reserved','manual');
  select count(*) into n from ketzal.commission_lines where booking_id=b and payee_type='embajador';
  select reason into got from ketzal.referral_misses where booking_id=b;
  if n=0 and got='sin_tarifa_de_la_agencia' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [8 sin tarifa: %s líneas, motivo «%s»]',n,coalesce(got,'ninguno')); end if;

  -- 9 · La comisión no cabe en la venta ⇒ no devenga, y lo dice.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,emb,PAX,CHICA,0,CHICA,'reserved','manual');
  select count(*) into n from ketzal.commission_lines where booking_id=b and payee_type='embajador';
  select reason into got from ketzal.referral_misses where booking_id=b;
  if n=0 and got='comisiones_exceden_la_venta' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [9 no cabe: %s líneas, motivo «%s»]',n,coalesce(got,'ninguno')); end if;

  -- 10 · AUTO-REFERIDO: el comprador del portal usando su propio código.
  --      Este SÍ lanza — vive en set_booking_ambassador, no en el trigger.
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              marketplace_customer_id,num_pax,subtotal,discount,total,status,channel)
    values (b,ag_a,ag_a,cli,svc,emb,PAX,TOT,0,TOT,'reserved','portal');
  perform set_config('request.jwt.claims', json_build_object('sub',admin_a,'role','authenticated')::text, true);
  begin
    perform ketzal.set_booking_ambassador(b, emb);
    fails:=fails+1; det:=det||' [10 auto-referido NO se bloqueó]';
  exception when others then
    if sqlerrm ilike '%si misma%' or sqlerrm ilike '%sí misma%' then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [10 auto-referido murió por otra causa: %s]',sqlerrm); end if;
  end;
  perform set_config('request.jwt.claims', null, true);

  ---------------------------------------------------- DINERO: ABONOS Y FIN ---
  -- 11 · ABONOS: un abono parcial no cambia lo devengado (el devengo es del
  --      momento de la venta; lo que el abono habilita es el PAGO de la
  --      comisión, y de eso se encarga el corte).
  b := gen_random_uuid();
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              ambassador_id,num_pax,subtotal,discount,total,status,channel,payment_type)
    values (b,ag_a,ag_a,cli,svc,emb,PAX,TOT,0,TOT,'reserved','manual','abonos');
  perform set_config('request.jwt.claims', json_build_object('sub',admin_a,'role','authenticated')::text, true);
  perform ketzal.register_payment(b, 3000, 'efectivo', now(), 'payment'::ketzal.payment_type);
  select coalesce(sum(amount_mxn),0) into s
    from ketzal.commission_lines where booking_id=b and payee_type='embajador' and kind='devengo';
  if s=250*PAX then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [11 abono movió el devengo a $%s]',s); end if;

  -- 12 · El CORTE solo paga ventas con dinero cobrado. Esta tiene $3000 ⇒ entra.
  --      (sigue con los claims del admin: `corte_embajadores` exige admin)
  begin
    -- Devuelve un OBJETO con la llave `filas`, no un arreglo.
    select count(*) into n
      from jsonb_array_elements(
             coalesce(ketzal.corte_embajadores(current_date)->'filas','[]'::jsonb)) e
     where e->>'embajador_id' = emb::text;
    if n >= 1 then ok:=ok+1;
    else fails:=fails+1; det:=det||' [12 la venta con abono cobrado no aparece en el corte]'; end if;
  exception when others then
    fails:=fails+1; det:=det||format(' [12 corte_embajadores truena: %s]',sqlerrm);
  end;

  -- 13 · CANCELAR reversa la comisión: el neto del embajador baja.
  begin
    perform ketzal.cancel_booking_v2(b, 'QA matriz', 'credito', true);
    select coalesce(sum(case when kind='devengo' then amount_mxn else -amount_mxn end),0) into s
      from ketzal.commission_lines where booking_id=b and payee_type='embajador';
    if s=0 then ok:=ok+1;
    else fails:=fails+1; det:=det||format(' [13 tras cancelar, el neto del embajador quedó en $%s]',s); end if;
  exception when others then
    fails:=fails+1; det:=det||format(' [13 cancel_booking_v2 truena: %s]',sqlerrm);
  end;
  perform set_config('request.jwt.claims', null, true);

  -- 14 · INMUTABILIDAD: ni el dueño de la BD puede borrar un asiento.
  begin
    delete from ketzal.commission_lines where booking_id=b;
    fails:=fails+1; det:=det||' [14 se pudo BORRAR una línea de comisión]';
  exception when others then ok:=ok+1; end;

  raise exception 'MOTOR DE COMISIONES -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
