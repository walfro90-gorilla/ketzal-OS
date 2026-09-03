-- HARD TESTING — desconectar la cuenta MP de una agencia (ADR-0042, b092).
--
--   pnpm hard-test mp_desconectar
--
-- Qué defiende: `mp_account_disconnect` borra la copia de Ketzal SOLO si quien
-- llama es admin activo de ESA agencia o superadmin. Sin sesión, un agente
-- (role user) o el admin de OTRA agencia reciben excepción y la fila sigue.
-- La segunda llamada devuelve false sin tronar. `mp_accounts` sigue deny-all
-- (un `authenticated` no borra directo). Queda rastro en `system_log`.
--
-- ADR-0035: termina en `raise exception` para que Postgres revierta TODO.
-- No toca una sola fila real: crea sus agencias, sus personas y sus cuentas MP.

do $$
declare
  ag     uuid := '0000c092-0000-4000-8000-00000000a001';
  ag2    uuid := '0000c092-0000-4000-8000-00000000a002';
  adm    uuid := '0000c092-0000-4000-8000-00000000d001';  -- admin de ag
  adm2   uuid := '0000c092-0000-4000-8000-00000000d002';  -- admin de ag2
  agente uuid := '0000c092-0000-4000-8000-00000000d003';  -- role user en ag
  super_ uuid := '0000c092-0000-4000-8000-00000000d004';  -- superadmin
  r boolean; n int; st jsonb;
  ok int := 0; fails int := 0; det text := '';
begin
  ---------------------------------------------------------------- fixtures ---
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate) values
    (ag, 'QA b092 A','qa.b092.a@ketzal.local','agency',0),
    (ag2,'QA b092 B','qa.b092.b@ketzal.local','agency',0);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  select u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.mail, crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''
  from (values (adm,'qa.b092.adm@ketzal.local'), (adm2,'qa.b092.adm2@ketzal.local'),
               (agente,'qa.b092.agente@ketzal.local'), (super_,'qa.b092.super@ketzal.local')
       ) as u(id, mail);

  insert into ketzal.profiles(id,email,name,role,supplier_id,type,active) values
    (adm,   'qa.b092.adm@ketzal.local',   'QA Admin A', 'admin',     ag,  'agente',true),
    (adm2,  'qa.b092.adm2@ketzal.local',  'QA Admin B', 'admin',     ag2, 'agente',true),
    (agente,'qa.b092.agente@ketzal.local','QA Agente A','user',      ag,  'agente',true),
    (super_,'qa.b092.super@ketzal.local', 'QA Super',   'superadmin',null,'agente',true);

  insert into ketzal.mp_accounts(supplier_id,mp_user_id,access_token,refresh_token,public_key,live_mode) values
    (ag, 'QA-MPUSER-A','APP_USR-qa-b092-a','TG-qa-b092-a','APP_USR-pk-a',true),
    (ag2,'QA-MPUSER-B','APP_USR-qa-b092-b',null,null,true);

  -- 1 · Sin sesión ⇒ excepción.
  perform set_config('request.jwt.claims', null, true);
  begin
    r := ketzal.mp_account_disconnect(ag);
    fails:=fails+1; det:=det||' [1 sin sesión desconectó]';
  exception when others then ok:=ok+1; end;

  -- 2 · Admin de OTRA agencia ⇒ excepción y la fila sigue.
  perform set_config('request.jwt.claims', json_build_object('sub', adm2)::text, true);
  begin
    r := ketzal.mp_account_disconnect(ag);
    fails:=fails+1; det:=det||' [2 admin ajeno desconectó]';
  exception when others then ok:=ok+1; end;
  select count(*) into n from ketzal.mp_accounts where supplier_id=ag;
  if n=1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [2b fila de ag: %s]',n); end if;

  -- 3 · Agente (role user) de la MISMA agencia ⇒ excepción.
  perform set_config('request.jwt.claims', json_build_object('sub', agente)::text, true);
  begin
    r := ketzal.mp_account_disconnect(ag);
    fails:=fails+1; det:=det||' [3 agente desconectó]';
  exception when others then ok:=ok+1; end;

  -- 4 · Deny-all intacto: como `authenticated` (admin) no se borra directo.
  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, true);
  begin
    set local role authenticated;
    delete from ketzal.mp_accounts where supplier_id=ag;
    reset role;
  exception when others then reset role; end;
  select count(*) into n from ketzal.mp_accounts where supplier_id=ag;
  if n=1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [4 authenticated borró directo: quedan %s]',n); end if;

  -- 5 · Admin de la agencia ⇒ true, fila fuera, status connected=false.
  r := ketzal.mp_account_disconnect(ag);
  if r then ok:=ok+1; else fails:=fails+1; det:=det||' [5 admin propio devolvió false]'; end if;
  select count(*) into n from ketzal.mp_accounts where supplier_id=ag;
  if n=0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [5b fila sigue: %s]',n); end if;
  st := ketzal.mp_account_status(ag);
  if coalesce((st->>'connected')::boolean,true) = false then ok:=ok+1;
  else fails:=fails+1; det:=det||' [5c status sigue connected]'; end if;

  -- 6 · Segunda vez ⇒ false, sin excepción (idempotente).
  begin
    r := ketzal.mp_account_disconnect(ag);
    if r=false then ok:=ok+1; else fails:=fails+1; det:=det||' [6 segunda vez devolvió true]'; end if;
  exception when others then fails:=fails+1; det:=det||' [6 segunda vez tronó: '||sqlerrm||']'; end;

  -- 7 · La otra agencia no se tocó.
  select count(*) into n from ketzal.mp_accounts where supplier_id=ag2;
  if n=1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [7 ag2 perdió su fila: %s]',n); end if;

  -- 8 · Superadmin desconecta cualquier agencia.
  perform set_config('request.jwt.claims', json_build_object('sub', super_)::text, true);
  r := ketzal.mp_account_disconnect(ag2);
  select count(*) into n from ketzal.mp_accounts where supplier_id=ag2;
  if r and n=0 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [8 superadmin: r=%s quedan=%s]',r,n); end if;

  -- 9 · Rastro: una línea por desconexión, con agencia, MP user y quién.
  perform set_config('request.jwt.claims', null, true);
  select count(*) into n from ketzal.system_log
   where source='mp_oauth' and event='desconectada'
     and detail->>'supplier_id'=ag::text and detail->>'mp_user_id'='QA-MPUSER-A' and detail->>'by'=adm::text;
  if n=1 then ok:=ok+1; else fails:=fails+1; det:=det||format(' [9 rastro de ag: %s líneas]',n); end if;

  raise exception 'MP DESCONECTAR -- % pasaron, % fallaron.%  (todo revertido)',
    ok, fails, coalesce(nullif(det,''),' Sin fallas.');
end $$;
