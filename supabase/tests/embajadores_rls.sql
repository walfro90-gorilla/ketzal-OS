-- HARD TESTING — embajadores operables (m005/m006/m007).
--
-- Qué se protege: quién puede reclutar embajadores, quién les fija la tarifa y
-- quién ve la de quién. La tarifa es dinero del embajador; si otra agencia la
-- toca, le cambia el sueldo a alguien que no es suyo.
--
-- Cómo correrlo: pegar en el SQL editor de Supabase. Siembra sus propios
-- embajadores, prueba, y borra todo al final verificando 0.
--
-- Trampas que este harness evita a propósito:
--   · Desde el SQL editor eres superusuario y la RLS NI SE EVALÚA ⇒ cada caso
--     hace `set local role authenticated` + set_config de los claims.
--   · Un INSERT que muere por `unique_violation` NO prueba el guard: se
--     distingue esa excepción de las demás, porque así se coló un falso verde
--     al desarrollar m005 (y destapó el bug del índice que arregló m006).
--   · El camino feliz corre en la MISMA pasada que los ataques: un harness que
--     solo verifica que el atacante falle da verde sobre un sistema inservible.

begin;

create temp table qa(caso text, veredicto text);
grant all on qa to authenticated;

do $$
declare
  v_wl     uuid := 'e9289a23-c174-45f7-8601-3c86be99fc40';  -- Wanderlust
  v_border uuid := 'dd46052b-4278-4661-968e-a7cec7b70f25';  -- Border
  v_emb_wl uuid := '0000e11a-0000-4000-8000-0000000000a1';
  v_emb_bo uuid := '0000e11a-0000-4000-8000-0000000000a2';
  v_admin_wl uuid; v_admin_bo uuid; v_agente uuid;
  n int;
begin
  select id into v_admin_wl from ketzal.profiles where supplier_id = v_wl and role='admin' limit 1;
  select id into v_admin_bo from ketzal.profiles where supplier_id = v_border and role='admin' limit 1;
  select id into v_agente  from ketzal.profiles where supplier_id = v_wl and role='user' limit 1;
  if v_admin_wl is null or v_admin_bo is null then
    insert into qa values ('setup','SALTADO: faltan admins de dos agencias'); return;
  end if;

  -- Dos embajadores, uno por agencia.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values
    (v_emb_wl,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.rls.emb.wl@ketzal.local', crypt('x', gen_salt('bf')), now(),now(),now(),'','','','','','','',''),
    (v_emb_bo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.rls.emb.bo@ketzal.local', crypt('x', gen_salt('bf')), now(),now(),now(),'','','','','','','','');
  insert into ketzal.profiles (id,email,name,role,supplier_id,type,active,referral_code) values
    (v_emb_wl,'qa.rls.emb.wl@ketzal.local','QA Emb WL','user',v_wl,'embajador',true,'QARLSWL'),
    (v_emb_bo,'qa.rls.emb.bo@ketzal.local','QA Emb BO','user',v_border,'embajador',true,'QARLSBO');

  -- ── El admin dueño gobierna lo suyo (camino feliz) ──────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin_wl,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into ketzal.commission_rules (payee_type,scope_profile_id,basis,rate,unit_amount,active)
    values ('embajador',v_emb_wl,'hibrido',4,150,true);
    insert into qa values ('admin fija tarifa a SU embajador','OK: pudo');
  exception when others then
    insert into qa values ('admin fija tarifa a SU embajador','ROTO: '||sqlerrm);
  end;
  select count(*) into n from ketzal.profiles where id = v_emb_wl;
  insert into qa values ('admin ve a su embajador', case when n=1 then 'OK: 1' else 'ROTO: '||n end);
  reset role;

  -- m006: un SEGUNDO embajador (otra agencia) también puede tener tarifa.
  -- Antes el índice único los colapsaba y solo cabía uno en toda la plataforma.
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin_bo,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into ketzal.commission_rules (payee_type,scope_profile_id,basis,rate,unit_amount,active)
    values ('embajador',v_emb_bo,'hibrido',5,100,true);
    insert into qa values ('2do embajador con tarifa (m006)','OK: pudo');
  exception
    when unique_violation then insert into qa values ('2do embajador con tarifa (m006)','ROTO: el indice los sigue colapsando');
    when others then insert into qa values ('2do embajador con tarifa (m006)','ROTO: '||sqlerrm);
  end;

  -- Cruce de agencias: Border no toca al embajador de Wanderlust.
  select count(*) into n from ketzal.profiles where id = v_emb_wl;
  insert into qa values ('admin ve embajador AJENO', case when n=0 then 'OK: 0' else 'HUECO: '||n end);
  select count(*) into n from ketzal.commission_rules where scope_profile_id = v_emb_wl;
  insert into qa values ('admin ve tarifa AJENA', case when n=0 then 'OK: 0' else 'HUECO: '||n end);
  begin
    update ketzal.commission_rules set rate = 99 where scope_profile_id = v_emb_wl;
    insert into qa values ('admin edita tarifa AJENA',
      case when found then 'HUECO: escribio' else 'OK: 0 filas' end);
  exception when others then
    insert into qa values ('admin edita tarifa AJENA','OK: '||sqlerrm);
  end;
  reset role;

  -- Un agente raso no fija tarifas a nadie.
  if v_agente is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',v_agente,'role','authenticated')::text, true);
    set local role authenticated;
    begin
      insert into ketzal.commission_rules (payee_type,scope_profile_id,basis,rate,active)
      values ('embajador',v_emb_wl,'percent',99,true);
      insert into qa values ('agente raso fija tarifa','HUECO: escribio');
    exception
      when unique_violation then insert into qa values ('agente raso fija tarifa','INVALIDO: choco el unique, no probo el guard');
      when others then insert into qa values ('agente raso fija tarifa','OK: '||sqlerrm);
    end;
    reset role;
  end if;

  -- m007: el embajador ve SU tarifa (si no, el portal miente diciendo que no hay).
  perform set_config('request.jwt.claims', json_build_object('sub',v_emb_wl,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from ketzal.commission_rules where scope_profile_id = v_emb_wl;
  insert into qa values ('embajador ve SU tarifa (m007)', case when n=1 then 'OK: 1' else 'ROTO: '||n end);
  select count(*) into n from ketzal.commission_rules where scope_profile_id = v_emb_bo;
  insert into qa values ('embajador ve tarifa de OTRO', case when n=0 then 'OK: 0' else 'HUECO: '||n end);
  begin
    update ketzal.commission_rules set rate = 50 where scope_profile_id = v_emb_wl;
    insert into qa values ('embajador se sube su tarifa',
      case when found then 'HUECO: escribio' else 'OK: 0 filas' end);
  exception when others then
    insert into qa values ('embajador se sube su tarifa','OK: '||sqlerrm);
  end;
  reset role;

  -- El motor resuelve y calcula: $10,000 con 3 pax a 4% + $150 = 850.
  insert into qa values ('motor calcula el hibrido',
    case when ketzal.commission_amount('hibrido',4,150,3,10000) = 850
         then 'OK: 850' else 'ROTO: '||ketzal.commission_amount('hibrido',4,150,3,10000) end);

  perform set_config('request.jwt.claims', null, true);
  delete from ketzal.commission_rules where scope_profile_id in (v_emb_wl, v_emb_bo);
  delete from ketzal.profiles where id in (v_emb_wl, v_emb_bo);
  delete from auth.users where id in (v_emb_wl, v_emb_bo);
end $$;

select caso, veredicto from qa;

-- Limpieza verificada.
select count(*) as filas_basura from ketzal.profiles where email like 'qa.rls.emb%';

commit;
