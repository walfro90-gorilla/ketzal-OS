-- HARD TESTING — el calendario de huecos: quién ve el historial y qué acepta la BD.
--
--   pnpm hard-test oportunidades
--
-- Qué defiende (ADR-0058): `oportunidades_fecha` es el historial de sugerencias
-- de UNA agencia. La ven y la escriben sus miembros (admin Y agente, no solo el
-- admin: la sugerencia la toma quien vende), no la ve otra agencia, nadie la
-- borra (sin policy de delete), y la salida que nace de un hueco queda ligada
-- por `departure_id` (que se suelta, no se pierde, si la salida se borra).
-- Además los CHECK de b099: duración fuera de rango, mes 13, alcance inventado
-- y agencia sin ningún alcance.
--
-- Se prueba por el camino real: cambiando de rol y de `auth.uid()`, no
-- llamando a la acción.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO. Crea
-- sus propias personas, agencias y servicio; no toca datos reales.

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
  admin_a  uuid := '0000c099-0000-4000-8000-00000000d001';
  agente_a uuid := '0000c099-0000-4000-8000-00000000d002';
  admin_b  uuid := '0000c099-0000-4000-8000-00000000d003';
  ag_a     uuid := '0000c099-0000-4000-8000-00000000a001';
  ag_b     uuid := '0000c099-0000-4000-8000-00000000a002';
  serv_s   uuid := '0000c099-0000-4000-8000-00000000c001';  -- de A
  sal_d    uuid := '0000c099-0000-4000-8000-00000000e001';  -- salida de S
  op_id    uuid;
  n int;
  got text;
  ok int := 0; fails int := 0; det text := '';
  r text;
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate) values
    (ag_a,'QA b099 Agencia A','qa.b099.a@ketzal.local','agency',0),
    (ag_b,'QA b099 Agencia B','qa.b099.b@ketzal.local','agency',0);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (admin_a, 'qa.b099.admin.a@ketzal.local'),
               (agente_a,'qa.b099.agente.a@ketzal.local'),
               (admin_b, 'qa.b099.admin.b@ketzal.local')) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (admin_a, 'qa.b099.admin.a@ketzal.local', 'QA Admin A', 'admin', ag_a, 'agente', true),
    (agente_a,'qa.b099.agente.a@ketzal.local','QA Agente A','user',  ag_a, 'agente', true),
    (admin_b, 'qa.b099.admin.b@ketzal.local', 'QA Admin B', 'admin', ag_b, 'agente', true);

  insert into ketzal.services(id,supplier_id,name,price,published,duration_days,meses_ideales) values
    (serv_s, ag_a, 'QA b099 Tour', 1000, false, 3, array[10,11,12]);

  ------------------------------------------------------ CHECK de b099 ---
  r := pg_temp.rechaza(1, 'duración 0',
    format('update ketzal.services set duration_days = 0 where id = %L', serv_s));
  if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(2, 'mes 13',
    format('update ketzal.services set meses_ideales = array[1,13] where id = %L', serv_s));
  if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(3, 'alcance inventado',
    format('update ketzal.suppliers set alcances_temporada = array[''nacional'',''marte''] where id = %L', ag_a));
  if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  r := pg_temp.rechaza(4, 'agencia sin ningún alcance',
    format('update ketzal.suppliers set alcances_temporada = ''{}'' where id = %L', ag_a));
  if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;
  -- 5 · El default es nacional: una agencia recién creada ya ve algo.
  select array_to_string(alcances_temporada, ',') into got from ketzal.suppliers where id = ag_b;
  if got = 'nacional' then ok:=ok+1;
  else fails:=fails+1; det:=det||format(' [5 el default de alcances fue %s]', got); end if;

  ------------------------------------------------------- RLS: agente de A ---
  -- 6 · El AGENTE de A (role user) emite/descarta un hueco de su agencia.
  perform set_config('request.jwt.claims', json_build_object('sub', agente_a)::text, true);
  begin
    set local role authenticated;
    insert into ketzal.oportunidades_fecha(supplier_id,clave,anio,inicio,fin,descartada_at)
      values (ag_a,'puente-nov',2026,'2026-11-14','2026-11-16',now());
    reset role;
    ok:=ok+1;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [6 el agente de A no pudo escribir el historial de su agencia: %s]', sqlerrm); end;
  -- 7 · …y lo lee.
  begin
    set local role authenticated;
    select count(*) into n from ketzal.oportunidades_fecha where supplier_id = ag_a;
    reset role;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [7 el agente de A vio %s filas, esperaba 1]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [7 error inesperado]'; end;
  -- 8 · …pero NO lo borra: no hay policy de delete, la fila se queda.
  begin
    set local role authenticated;
    delete from ketzal.oportunidades_fecha where supplier_id = ag_a;
    reset role;
    select count(*) into n from ketzal.oportunidades_fecha where supplier_id = ag_a;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [8 el agente BORRÓ el historial: quedan %s]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [8 error inesperado: %s]', sqlerrm); end;

  -------------------------------------------------------- RLS: admin de B ---
  perform set_config('request.jwt.claims', json_build_object('sub', admin_b)::text, true);
  -- 9 · El admin de B no ve el historial de A.
  begin
    set local role authenticated;
    select count(*) into n from ketzal.oportunidades_fecha;
    reset role;
    if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [9 el admin de B vio %s filas de A]', n); end if;
  exception when others then reset role; fails:=fails+1; det:=det||' [9 error inesperado]'; end;
  -- 10 · …ni escribe una fila a nombre de A.
  begin
    set local role authenticated;
    insert into ketzal.oportunidades_fecha(supplier_id,clave,anio,inicio,fin)
      values (ag_a,'guadalupe',2026,'2026-12-12','2026-12-12');
    reset role;
    fails:=fails+1; det:=det||' [10 el admin de B escribió a nombre de A]';
  exception when others then reset role; ok:=ok+1; end;
  -- 11 · …ni actualiza la de A (0 filas afectadas, sin error).
  begin
    set local role authenticated;
    update ketzal.oportunidades_fecha set descartada_at = null where supplier_id = ag_a;
    reset role;
    select count(*) into n from ketzal.oportunidades_fecha where supplier_id = ag_a and descartada_at is not null;
    if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [11 el admin de B reactivó el hueco de A]'; end if;
  exception when others then reset role; fails:=fails+1; det:=det||format(' [11 error inesperado: %s]', sqlerrm); end;
  perform set_config('request.jwt.claims', null, true);

  --------------------------------------------- unicidad y salida ligada ---
  -- 12 · La misma temporada del mismo año para la misma agencia no se duplica.
  begin
    insert into ketzal.oportunidades_fecha(supplier_id,clave,anio,inicio,fin)
      values (ag_a,'puente-nov',2026,'2026-11-14','2026-11-16');
    fails:=fails+1; det:=det||' [12 se duplicó (agencia, clave, año)]';
  exception when unique_violation then ok:=ok+1;
  end;
  -- 13 · La salida creada desde el hueco queda ligada; borrarla suelta el enlace
  --      (set null) sin perder la fila del historial.
  insert into ketzal.service_departures(id,service_id,departs_on,max_capacity) values (sal_d, serv_s, '2026-11-13', 15);
  perform set_config('request.jwt.claims', json_build_object('sub', admin_a)::text, true);
  begin
    set local role authenticated;
    update ketzal.oportunidades_fecha set departure_id = sal_d, descartada_at = null
     where supplier_id = ag_a and clave = 'puente-nov' and anio = 2026;
    reset role;
  exception when others then reset role; det:=det||format(' [13 el admin de A no pudo ligar la salida: %s]', sqlerrm); end;
  perform set_config('request.jwt.claims', null, true);
  select departure_id into op_id from ketzal.oportunidades_fecha where supplier_id = ag_a and clave = 'puente-nov';
  if op_id = sal_d then ok:=ok+1; else fails:=fails+1; det:=det||' [13 la salida no quedó ligada al hueco]'; end if;
  delete from ketzal.service_departures where id = sal_d;
  select count(*) filter (where departure_id is null) into n from ketzal.oportunidades_fecha where supplier_id = ag_a;
  -- 14
  if n = 1 then ok:=ok+1; else fails:=fails+1; det:=det||' [14 borrar la salida borró o dejó colgado el historial]'; end if;
  -- 15 · Fechas al revés no entran.
  r := pg_temp.rechaza(15, 'inicio > fin',
    format('insert into ketzal.oportunidades_fecha(supplier_id,clave,anio,inicio,fin) values (%L,''x-y'',2026,''2026-12-12'',''2026-12-01'')', ag_b));
  if r = '' then ok:=ok+1; else fails:=fails+1; det:=det||r; end if;

  ------------------------------------------------------------- cascade ---
  -- 16 · Borrar la agencia se lleva su historial (y su servicio, como siempre).
  delete from ketzal.suppliers where id = ag_a;
  select count(*) into n from ketzal.oportunidades_fecha where supplier_id = ag_a;
  if n = 0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [16 quedaron %s filas huérfanas]', n); end if;

  raise exception 'OPORTUNIDADES -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
