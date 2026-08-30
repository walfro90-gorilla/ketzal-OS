-- HARD TESTING — embajadores operables (m005–m008).
--
-- El modelo que se protege (ADR-0021):
--   · Cualquier embajador vende viajes de CUALQUIER agencia. Sin límite.
--   · Paga la agencia DUEÑA del viaje, con la tarifa que ELLA fijó.
--   · Un override por persona (trato especial) gana sobre la de agencia.
--   · Ketzal recluta embajadores directos, sin agencia (`supplier_id` null).
--
-- Si una agencia pudiera fijar la tarifa de otra, le estaría cambiando el costo
-- de ventas a un tercero. Y si la resolución fallara, el mismo embajador
-- cobraría lo mismo en todas partes — que es justo lo que m008 vino a corregir.
--
-- Cómo correrlo: pegar en el SQL editor de Supabase. Siembra lo suyo y borra al
-- final verificando 0.
--
-- Trampas que este harness evita a propósito:
--   · Desde el SQL editor eres superusuario y la RLS NI SE EVALÚA ⇒ cada caso
--     hace `set local role authenticated` + set_config de los claims.
--   · Un INSERT que muere por `unique_violation` NO prueba el guard: se
--     distingue esa excepción de las demás, porque así se coló un falso verde
--     al desarrollar m005 — y destapó el bug del índice que arregló m006.
--   · El camino feliz corre en la MISMA pasada que los ataques.

begin;

create temp table qa(caso text, veredicto text);
grant all on qa to authenticated;

do $$
declare
  v_wl uuid := 'e9289a23-c174-45f7-8601-3c86be99fc40';  -- Wanderlust
  v_bo uuid := 'dd46052b-4278-4661-968e-a7cec7b70f25';  -- Border
  v_emb_ketzal uuid := '0000e11a-0000-4000-8000-0000000000c1';  -- sin agencia
  v_emb_wl     uuid := '0000e11a-0000-4000-8000-0000000000c2';  -- de Wanderlust
  v_admin_wl uuid; v_admin_bo uuid; r record; n int;
begin
  select id into v_admin_wl from ketzal.profiles where supplier_id=v_wl and role='admin' limit 1;
  select id into v_admin_bo from ketzal.profiles where supplier_id=v_bo and role='admin' limit 1;
  if v_admin_wl is null or v_admin_bo is null then
    insert into qa values ('setup','SALTADO: faltan admins de dos agencias'); return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values
    (v_emb_ketzal,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.ketzal@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''),
    (v_emb_wl,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.wl@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','','');
  -- El embajador de Ketzal va SIN agencia: el caso que m005 no permitía.
  insert into ketzal.profiles (id,email,name,role,supplier_id,type,active,referral_code) values
    (v_emb_ketzal,'qa.m008.ketzal@ketzal.local','QA Emb Ketzal','user',null,'embajador',true,'QAM008K'),
    (v_emb_wl,'qa.m008.wl@ketzal.local','QA Emb WL','user',v_wl,'embajador',true,'QAM008W');
  insert into qa values ('1 embajador de Ketzal SIN agencia se crea','OK: pudo');

  -- ── Cada agencia fija SU tarifa, y solo la suya ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin_wl,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into ketzal.commission_rules (payee_type, scope_supplier_id, basis, rate, unit_amount, active)
    values ('embajador', v_wl, 'hibrido', 4, 150, true);
    insert into qa values ('2 Wanderlust fija su tarifa de embajadores','OK: pudo');
  exception when others then insert into qa values ('2 Wanderlust fija su tarifa de embajadores','ROTO: '||sqlerrm); end;
  begin
    insert into ketzal.commission_rules (payee_type, scope_supplier_id, basis, rate, active)
    values ('embajador', v_bo, 'percent', 50, true);
    insert into qa values ('3 Wanderlust fija tarifa de BORDER','HUECO: escribio');
  exception
    when unique_violation then insert into qa values ('3 Wanderlust fija tarifa de BORDER','INVALIDO: unique, no probo el guard');
    when others then insert into qa values ('3 Wanderlust fija tarifa de BORDER','OK: '||sqlerrm); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',v_admin_bo,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into ketzal.commission_rules (payee_type, scope_supplier_id, basis, unit_amount, active)
    values ('embajador', v_bo, 'fijo_pax', 200, true);
    insert into qa values ('4 Border fija SU tarifa (distinta)','OK: pudo');
  exception when others then insert into qa values ('4 Border fija SU tarifa (distinta)','ROTO: '||sqlerrm); end;
  reset role;

  -- ── El corazón del modelo: la agencia del viaje manda ───────────────────
  select * into r from ketzal.resolve_commission_rule(null,'embajador',v_emb_ketzal,v_wl);
  insert into qa values ('5 emb Ketzal vende viaje de WL',
    case when r.basis='hibrido' and r.rate=4 then 'OK: 4% + $150 (tarifa de WL)'
         else 'ROTO: '||coalesce(r.basis,'sin regla') end);
  select * into r from ketzal.resolve_commission_rule(null,'embajador',v_emb_ketzal,v_bo);
  insert into qa values ('6 emb Ketzal vende viaje de BORDER',
    case when r.basis='fijo_pax' and r.unit_amount=200 then 'OK: $200/pax (tarifa de Border)'
         else 'ROTO: '||coalesce(r.basis,'sin regla') end);
  select * into r from ketzal.resolve_commission_rule(null,'embajador',v_emb_wl,v_bo);
  insert into qa values ('7 emb de WL vende viaje de BORDER (sin limite)',
    case when r.basis='fijo_pax' then 'OK: cobra la tarifa de Border'
         else 'ROTO: '||coalesce(r.basis,'sin regla') end);

  -- Trato especial: gana sobre la tarifa de cualquier agencia.
  insert into ketzal.commission_rules (payee_type, scope_profile_id, basis, rate, active)
  values ('embajador', v_emb_ketzal, 'percent', 10, true);
  select * into r from ketzal.resolve_commission_rule(null,'embajador',v_emb_ketzal,v_wl);
  insert into qa values ('8 override del embajador gana',
    case when r.basis='percent' and r.rate=10 then 'OK: 10% (su trato especial)'
         else 'ROTO: '||coalesce(r.basis,'sin regla') end);

  -- Agencia sin tarifa ⇒ no devenga (y quedará rastro en referral_misses).
  select count(*) into n from ketzal.resolve_commission_rule(null,'embajador',v_emb_wl,
    (select id from ketzal.suppliers where id not in (v_wl,v_bo) limit 1));
  insert into qa values ('9 agencia sin tarifa no devenga',
    case when n=0 then 'OK: sin regla' else 'HUECO: '||n end);

  -- El check rechaza la regla incoherente (los dos scopes a la vez).
  begin
    insert into ketzal.commission_rules (payee_type, scope_supplier_id, scope_profile_id, basis, rate, active)
    values ('embajador', v_wl, v_emb_wl, 'percent', 1, true);
    insert into qa values ('10 regla con ambos scopes','HUECO: la acepto');
  exception when others then insert into qa values ('10 regla con ambos scopes','OK: rechazada'); end;

  -- El embajador lee las tarifas (las necesita su portal) pero no las escribe.
  perform set_config('request.jwt.claims', json_build_object('sub',v_emb_ketzal,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from ketzal.commission_rules
   where payee_type='embajador' and scope_supplier_id is not null and active;
  insert into qa values ('11 embajador ve las tarifas de agencia',
    case when n>=2 then 'OK: '||n else 'ROTO: '||n end);
  begin
    update ketzal.commission_rules set rate=99
     where payee_type='embajador' and scope_supplier_id = v_wl;
    insert into qa values ('12 embajador se sube la tarifa',
      case when found then 'HUECO: escribio' else 'OK: 0 filas' end);
  exception when others then insert into qa values ('12 embajador se sube la tarifa','OK: '||sqlerrm); end;
  -- Y NO ve los datos sensibles de las agencias (correo, comisión, CLABE).
  select count(*) into n from ketzal.suppliers;
  insert into qa values ('13 embajador lee suppliers directo',
    case when n=0 then 'OK: 0 filas' else 'HUECO: '||n end);
  reset role;

  insert into qa values ('14 motor calcula el hibrido',
    case when ketzal.commission_amount('hibrido',4,150,3,10000)=850 then 'OK: 850'
         else 'ROTO: '||ketzal.commission_amount('hibrido',4,150,3,10000) end);

  perform set_config('request.jwt.claims', null, true);
  delete from ketzal.commission_rules
   where scope_profile_id in (v_emb_ketzal,v_emb_wl)
      or (payee_type='embajador' and scope_supplier_id in (v_wl,v_bo));
  delete from ketzal.profiles where id in (v_emb_ketzal,v_emb_wl);
  delete from auth.users where id in (v_emb_ketzal,v_emb_wl);
  insert into qa values ('15 limpieza',
    (select case when count(*)=0 then 'OK: 0' else 'SUCIO: '||count(*) end
       from ketzal.profiles where email like 'qa.m008%'));
end $$;

select caso, veredicto from qa order by caso;

commit;
