-- HARD TESTING — el costeo de tours: quién lo ve y qué se acepta.
--
--   pnpm hard-test costeo
--
-- Qué defiende (ADR-0055): el tarifario de un proveedor y la hoja de costeo de
-- un servicio los ve y escribe SOLO el admin de la agencia dueña (o superadmin).
-- Un agente de la misma agencia, el admin de otra agencia y el anónimo no ven
-- ni una fila ni pueden escribir. Y los CHECK rechazan el documento roto que un
-- form (o un `curl`) podría mandar: unidad desconocida, costo negativo, pack
-- inventado, margen 100, pax 0.
--
-- Se prueba por el camino real: cambiando de rol y de `auth.uid()`, no
-- llamando a la acción. La familia de bug que ya mordió aquí es un CHECK que
-- acepta NULL (b095b) y un guard que devuelve NULL en vez de false (m004).
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. Crea
-- sus propias personas, agencias, proveedores y servicio; no toca datos reales.

-- Helper temporal (vive en pg_temp, se va con el rollback del corredor):
-- ejecuta el insert y dice '' si el CHECK lo rechazó; si se aceptó, lo
-- deshace (raise dentro del sub-bloque) y lo reporta.
create function pg_temp.rechaza(p_num int, p_msg text, p_sql text) returns text
language plpgsql as $f$
begin
  begin
    execute p_sql;
    raise exception using errcode = 'P0777';
  exception
    when check_violation then return '';
    when sqlstate 'P0777' then return format(' [%s SE ACEPTÓ: %s]', p_num, p_msg);
    when others then return format(' [%s error inesperado (%s): %s]', p_num, p_msg, sqlerrm);
  end;
end $f$;

do $$
declare
  super_   uuid := '0000c097-0000-4000-8000-00000000d001';
  admin_a  uuid := '0000c097-0000-4000-8000-00000000d002';
  agente_a uuid := '0000c097-0000-4000-8000-00000000d003';
  admin_b  uuid := '0000c097-0000-4000-8000-00000000d004';
  ag_a     uuid := '0000c097-0000-4000-8000-00000000a001';
  ag_b     uuid := '0000c097-0000-4000-8000-00000000a002';
  prov_p   uuid := '0000c097-0000-4000-8000-00000000b001';  -- de A
  prov_q   uuid := '0000c097-0000-4000-8000-00000000b002';  -- sin dueño (legado)
  serv_s   uuid := '0000c097-0000-4000-8000-00000000c001';  -- de A
  tarifa_ok jsonb := '[{"key":"sprinter","label":"Sprinter","unit":"grupo","cost":8000,"cap":15},
                       {"key":"hotel","label":"Hotel","unit":"habitacion","cost_by_pack":{"doble":1200}}]';
  costeo_ok jsonb := '{"plan_pax":16,"nights":2,"days":3,"margin_pct":30,
                       "lines":[{"supplier_id":"0000c097-0000-4000-8000-00000000b001","supplier_name":"P",
                                 "rate_key":"sprinter","label":"Sprinter","unit":"grupo","cost":8000,"cap":15,"qty":1}],
                       "addon_costs":{"tirolesa":{"cost":350}}}';
  n int;
  ok int := 0; fails int := 0; det text := '';

  r text;
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate,owner_supplier_id) values
    (ag_a,  'QA b097 Agencia A','qa.b097.a@ketzal.local','agency',0,null),
    (ag_b,  'QA b097 Agencia B','qa.b097.b@ketzal.local','agency',0,null),
    (prov_p,'QA b097 Prov P',   'qa.b097.p@ketzal.local','transporte',0,ag_a),
    (prov_q,'QA b097 Prov Q',   'qa.b097.q@ketzal.local','hotel',0,null);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (super_,  'qa.b097.super@ketzal.local'),
               (admin_a, 'qa.b097.admin.a@ketzal.local'),
               (agente_a,'qa.b097.agente.a@ketzal.local'),
               (admin_b, 'qa.b097.admin.b@ketzal.local')) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (super_,  'qa.b097.super@ketzal.local',   'QA Super',   'superadmin', null, 'agente', true),
    (admin_a, 'qa.b097.admin.a@ketzal.local', 'QA Admin A', 'admin',      ag_a, 'agente', true),
    (agente_a,'qa.b097.agente.a@ketzal.local','QA Agente A','user',       ag_a, 'agente', true),
    (admin_b, 'qa.b097.admin.b@ketzal.local', 'QA Admin B', 'admin',      ag_b, 'agente', true);

  insert into ketzal.services(id,supplier_id,name,price,published) values
    (serv_s, ag_a, 'QA b097 Tour', 1000, false);

  ------------------------------------------------ CHECK: tarifario roto ---
  r := pg_temp.rechaza(1, 'unidad desconocida',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"x","label":"X","unit":"hora","cost":1}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(2, 'costo negativo',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"x","label":"X","unit":"pax","cost":-1}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(3, 'pack inventado en cost_by_pack',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"h","label":"H","unit":"habitacion","cost_by_pack":{"doble":1200,"quintuple":5}}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(4, 'cap 0',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"s","label":"S","unit":"grupo","cost":8000,"cap":0}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(5, 'habitación sin cost_by_pack',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"h","label":"H","unit":"habitacion","cost":1200}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(6, 'key duplicada',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"s","label":"S","unit":"grupo","cost":1},{"key":"s","label":"S2","unit":"grupo","cost":2}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(7, 'costo faltante (NULL no pasa el CHECK)',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '[{"key":"s","label":"S","unit":"grupo"}]')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(8, 'tarifario que no es arreglo',
    format('insert into ketzal.supplier_rate_cards(supplier_id,rates) values (%L, %L)', prov_p,
      '{"key":"s"}')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;

  -------------------------------------------------- CHECK: costeo roto ---
  r := pg_temp.rechaza(9, 'margen 100',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{margin_pct}', '100'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(10, 'pax 0',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{plan_pax}', '0'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(11, 'días con decimales',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{days}', '1.5'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(12, 'qty 0 en una línea',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{lines,0,qty}', '0'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(13, 'línea sin proveedor',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{lines,0,supplier_id}', '""'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(14, 'add-on con costo negativo',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      jsonb_set(costeo_ok, '{addon_costs,tirolesa,cost}', '-1'))); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(15, 'cabecera sin noches (NULL no pasa el CHECK)',
    format('insert into ketzal.service_costings(service_id,doc) values (%L, %L)', serv_s,
      costeo_ok - 'nights')); if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;

  ------------------------------------------------------ RLS: admin de A ---
  perform set_config('request.jwt.claims', json_build_object('sub', admin_a)::text, true);
  -- 16 · El admin de A escribe el tarifario de SU proveedor (documento válido, pack parcial).
  begin
    set local role authenticated;
    insert into ketzal.supplier_rate_cards(supplier_id,rates) values (prov_p, tarifa_ok);
    reset role;
    ok:=ok+1;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [16 el admin de A no pudo escribir el tarifario de su proveedor: %s]', sqlerrm); end;
  -- 17 · …y lo lee.
  begin
    set local role authenticated;
    select count(*) into n from ketzal.supplier_rate_cards where supplier_id = prov_p;
    reset role;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [17 el admin de A vio %s tarifarios de su proveedor]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [17 error inesperado]'; end;
  -- 18 · …y lo actualiza.
  begin
    set local role authenticated;
    update ketzal.supplier_rate_cards set rates = tarifa_ok || '[{"key":"guia","label":"Guía","unit":"dia","cost":1500}]'
     where supplier_id = prov_p;
    select count(*) into n from ketzal.supplier_rate_cards where supplier_id = prov_p and jsonb_array_length(rates) = 3;
    reset role;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [18 el update del admin de A no se aplicó]'; end if;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [18 el admin de A no pudo actualizar: %s]', sqlerrm); end;
  -- 19 · El admin de A escribe el costeo de SU servicio.
  begin
    set local role authenticated;
    insert into ketzal.service_costings(service_id,doc) values (serv_s, costeo_ok);
    select count(*) into n from ketzal.service_costings where service_id = serv_s;
    reset role;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [19 el admin de A no ve el costeo que acaba de escribir]'; end if;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [19 el admin de A no pudo escribir el costeo: %s]', sqlerrm); end;
  -- 20 · El admin de A NO toca el tarifario de un proveedor sin dueño.
  begin
    set local role authenticated;
    insert into ketzal.supplier_rate_cards(supplier_id,rates) values (prov_q, tarifa_ok);
    reset role;
    fails:=fails+1; det:=det||' [20 el admin de A escribió el tarifario de un proveedor que no es suyo]';
  exception when others then reset role; ok:=ok+1; end;

  ---------------------------------------------------- RLS: agente de A ---
  perform set_config('request.jwt.claims', json_build_object('sub', agente_a)::text, true);
  -- 21 · Un agente (role user) de la MISMA agencia no ve ni un costo.
  begin
    set local role authenticated;
    select count(*) into n from ketzal.supplier_rate_cards;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [21 un AGENTE vio %s tarifarios]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [21 error inesperado]'; end;
  begin
    set local role authenticated;
    select count(*) into n from ketzal.service_costings;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [22 un AGENTE vio %s costeos]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [22 error inesperado]'; end;
  -- 23 · …ni escribe.
  begin
    set local role authenticated;
    update ketzal.service_costings set doc = jsonb_set(doc, '{margin_pct}', '5') where service_id = serv_s;
    get diagnostics n = row_count;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||' [23 un AGENTE actualizó el costeo]'; end if;
  exception when others then reset role; ok:=ok+1; end;

  ------------------------------------------------------ RLS: admin de B ---
  perform set_config('request.jwt.claims', json_build_object('sub', admin_b)::text, true);
  -- 24 · El admin de OTRA agencia no ve nada.
  begin
    set local role authenticated;
    select (select count(*) from ketzal.supplier_rate_cards) + (select count(*) from ketzal.service_costings) into n;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [24 el admin de B vio %s filas de A]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [24 error inesperado]'; end;
  -- 25 · …ni escribe en lo de A.
  begin
    set local role authenticated;
    insert into ketzal.service_costings(service_id,doc) values (serv_s, costeo_ok);
    reset role;
    fails:=fails+1; det:=det||' [25 el admin de B escribió un costeo de A]';
  exception when others then reset role; ok:=ok+1; end;

  ------------------------------------------------------------ RLS: anon ---
  perform set_config('request.jwt.claims', null, true);
  -- 26 · El ANÓNIMO no alcanza las tablas ni para leer.
  begin
    set local role anon;
    perform 1 from ketzal.supplier_rate_cards limit 1;
    reset role;
    fails:=fails+1; det:=det||' [26 el ANÓNIMO leyó tarifarios]';
  exception when others then reset role; ok:=ok+1; end;
  begin
    set local role anon;
    perform 1 from ketzal.service_costings limit 1;
    reset role;
    fails:=fails+1; det:=det||' [27 el ANÓNIMO leyó costeos]';
  exception when others then reset role; ok:=ok+1; end;

  ------------------------------------------------------ RLS: superadmin ---
  perform set_config('request.jwt.claims', json_build_object('sub', super_)::text, true);
  -- 28 · El superadmin lee todo y escribe el tarifario del proveedor sin dueño.
  begin
    set local role authenticated;
    insert into ketzal.supplier_rate_cards(supplier_id,rates) values (prov_q, tarifa_ok);
    select (select count(*) from ketzal.supplier_rate_cards) + (select count(*) from ketzal.service_costings) into n;
    reset role;
    if n = 3 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [28 el superadmin vio %s filas, esperaba 3]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [28 el superadmin no pudo: %s]', sqlerrm); end;
  perform set_config('request.jwt.claims', null, true);

  --------------------------------------------------------------- cascade ---
  -- 29 · Borrar el servicio se lleva su costeo; borrar el proveedor, su tarifario.
  delete from ketzal.services where id = serv_s;
  delete from ketzal.suppliers where id = prov_p;
  select (select count(*) from ketzal.service_costings where service_id = serv_s)
       + (select count(*) from ketzal.supplier_rate_cards where supplier_id = prov_p) into n;
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [29 quedaron %s filas huérfanas tras el cascade]', n); end if;

  raise exception 'COSTEO -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
