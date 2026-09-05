-- HARD TESTING — el contenido de destinos: quién lo edita y qué se publica.
--
--   pnpm hard-test destinos_contenido
--
-- Qué defiende (ADR-0053): `ketzal.destinos` guarda texto que ve CUALQUIER
-- visitante, así que el riesgo no es perder datos sino dos cosas silenciosas:
-- que un borrador se escape a la vitrina, y que alguien que no es superadmin
-- pueda escribir en la superficie pública. Las dos se prueban aquí por el
-- camino real: cambiando de rol y de `auth.uid()`, no llamando a la acción.
--
-- Se afirma explícitamente lo que el ANÓNIMO no puede, que es la familia que ya
-- mordió en este repo: un guard DEFINER que devuelve de más (ADR-0037) o un
-- GRANT sin columnas que abre escritura por PostgREST (ADR-0006).
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. Crea
-- sus propias personas y sus propias filas; no lee ni toca datos reales.

do $$
declare
  super_  uuid := '0000c095-0000-4000-8000-00000000d001';
  agente_ uuid := '0000c095-0000-4000-8000-00000000d002';
  ag      uuid := '0000c095-0000-4000-8000-00000000a001';
  n int; got jsonb; txt text;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate)
    values (ag,'QA b095 Agencia','qa.b095@ketzal.local','agency',0);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (super_,'qa.b095.super@ketzal.local'), (agente_,'qa.b095.agente@ketzal.local')
       ) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (super_, 'qa.b095.super@ketzal.local', 'QA Super',  'superadmin', null, 'agente', true),
    (agente_,'qa.b095.agente@ketzal.local','QA Agente', 'admin',      ag,   'agente', true);

  -- Un destino publicado y uno en borrador.
  insert into ketzal.destinos(slug,nombre,estado,pais,ubicacion,que_visitar,publicado) values
    ('qa-publicado','QA Publicado','Chihuahua','México','Existe y se publica','["Uno"]'::jsonb, true),
    ('qa-borrador', 'QA Borrador', 'Chihuahua','México','Existe y NO se publica','["Dos"]'::jsonb, false);

  -- 1 · El RPC público devuelve SOLO lo publicado.
  got := ketzal.list_destinos_publicos();
  select count(*) into n from jsonb_array_elements(got) e where e->>'slug' = 'qa-publicado';
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [1 el publicado no sale en el RPC]'; end if;

  -- 2 · …y NO devuelve el borrador. Este es el fallo que nadie reporta.
  select count(*) into n from jsonb_array_elements(got) e where e->>'slug' = 'qa-borrador';
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||' [2 EL BORRADOR SE ESCAPÓ a la vitrina]'; end if;

  -- 3 · El RPC no expone columnas internas (publicado / fechas).
  select e into got from jsonb_array_elements(ketzal.list_destinos_publicos()) e
   where e->>'slug' = 'qa-publicado';
  if not (got ? 'publicado') and not (got ? 'created_at') and not (got ? 'updated_at')
    then ok:=ok+1; else fails:=fails+1; det:=det||' [3 el RPC expone columnas internas]'; end if;

  -- 4 · ANÓNIMO: no alcanza la tabla ni para leer.
  begin
    set local role anon;
    perform 1 from ketzal.destinos limit 1;
    reset role;
    fails:=fails+1; det:=det||' [4 el ANÓNIMO leyó la tabla]';
  exception when others then reset role; ok:=ok+1; end;

  -- 5 · ANÓNIMO: tampoco escribe.
  begin
    set local role anon;
    insert into ketzal.destinos(slug,nombre) values ('qa-anon','Colado');
    reset role;
    fails:=fails+1; det:=det||' [5 el ANÓNIMO escribió en la superficie pública]';
  exception when others then reset role; ok:=ok+1; end;

  -- 6 · Admin de agencia (NO superadmin): la RLS no le muestra nada.
  perform set_config('request.jwt.claims', json_build_object('sub', agente_)::text, true);
  begin
    set local role authenticated;
    select count(*) into n from ketzal.destinos;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [6 un admin de agencia vio %s filas]',n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [6 error inesperado]'; end;

  -- 7 · Admin de agencia: no puede escribir.
  begin
    set local role authenticated;
    insert into ketzal.destinos(slug,nombre) values ('qa-agente','Colado');
    reset role;
    fails:=fails+1; det:=det||' [7 un admin de agencia escribió un destino público]';
  exception when others then reset role; ok:=ok+1; end;

  -- 8 · Superadmin: sí lee.
  perform set_config('request.jwt.claims', json_build_object('sub', super_)::text, true);
  begin
    set local role authenticated;
    select count(*) into n from ketzal.destinos;
    reset role;
    if n >= 2 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [8 el superadmin solo vio %s filas]',n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [8 el superadmin no pudo leer]'; end;

  -- 9 · Superadmin: sí escribe, y publicar hace que aparezca en el RPC.
  begin
    set local role authenticated;
    update ketzal.destinos set publicado = true where slug = 'qa-borrador';
    reset role;
    select count(*) into n from jsonb_array_elements(ketzal.list_destinos_publicos()) e
     where e->>'slug' = 'qa-borrador';
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [9 publicar no lo sacó en el RPC]'; end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [9 el superadmin no pudo escribir]'; end;
  perform set_config('request.jwt.claims', null, true);

  -- 10 · Media coordenada se rechaza: un punto a medias sale del mapa sin que
  --      nadie lo note en el formulario.
  begin
    insert into ketzal.destinos(slug,nombre,lat) values ('qa-media','Media coordenada', 27.5);
    fails:=fails+1; det:=det||' [10 se aceptó media coordenada]';
  exception when others then ok:=ok+1; end;

  -- 11 · `que_visitar` tiene que ser arreglo.
  begin
    insert into ketzal.destinos(slug,nombre,que_visitar) values ('qa-obj','Objeto','{"a":1}'::jsonb);
    fails:=fails+1; det:=det||' [11 se aceptó que_visitar que no es arreglo]';
  exception when others then ok:=ok+1; end;

  -- 12 · `updated_at` se mueve solo al editar (rastro de quién tocó qué y cuándo).
  select updated_at::text into txt from ketzal.destinos where slug = 'qa-publicado';
  update ketzal.destinos set por_que = 'editado' where slug = 'qa-publicado';
  select count(*) into n from ketzal.destinos
   where slug = 'qa-publicado' and updated_at::text <> txt;
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [12 updated_at no se movió al editar]'; end if;

  raise exception 'DESTINOS -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
