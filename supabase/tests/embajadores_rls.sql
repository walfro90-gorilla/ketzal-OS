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
-- Cómo correrlo: `pnpm hard-test embajadores_rls`.
--
-- ⚠ Este harness YA CAUSÓ PÉRDIDA DE DATOS EN PRODUCCIÓN (2026-09-01). Tenía
-- hardcodeados los ids REALES de Wanderlust y Border, les insertaba tarifas de
-- embajador, y limpiaba con `delete … where payee_type='embajador' and
-- scope_supplier_id in (v_wl,v_bo)` — que también borraba las tarifas reales del
-- fundador — y remataba con `commit`. Se llevó las dos de $250/pax.
-- Dos cambios para que no pueda repetirse:
--   · **Termina en `rollback`**, no en `commit`. Nada de lo que hace persiste,
--     así que no necesita limpieza y no puede borrar nada de nadie. El corredor
--     ahora se NIEGA a correr un .sql que traiga `commit`.
--   · **Crea sus propias agencias**, no toca las reales. De paso desaparece la
--     colisión de `unique_violation` contra una tarifa real ya existente.
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
  -- Agencias PROPIAS del harness. Antes eran las reales (Wanderlust y Border) y
  -- por eso pudo borrarles sus tarifas. Nada aquí toca datos del fundador.
  v_wl uuid := '0000a6c1-0000-4000-8000-0000000000a1';  -- "agencia 1" (hacía de Wanderlust)
  v_bo uuid := '0000a6c1-0000-4000-8000-0000000000a2';  -- "agencia 2" (hacía de Border)
  v_admin_wl uuid := '0000a6c1-0000-4000-8000-0000000000b1';
  v_admin_bo uuid := '0000a6c1-0000-4000-8000-0000000000b2';
  v_sin_tarifa uuid := '0000a6c1-0000-4000-8000-0000000000a3';  -- agencia 3: vacía a propósito
  v_emb_ketzal uuid := '0000e11a-0000-4000-8000-0000000000c1';  -- sin agencia
  v_emb_wl     uuid := '0000e11a-0000-4000-8000-0000000000c2';  -- de la agencia 1
  r record; n int;
begin
  insert into ketzal.suppliers (id,name,contact_email,supplier_type,commission_rate) values
    (v_wl,'QA m008 Agencia 1','qa.m008.ag1@ketzal.local','agency',0),
    (v_bo,'QA m008 Agencia 2','qa.m008.ag2@ketzal.local','agency',0),
    (v_sin_tarifa,'QA m008 Agencia 3 (sin tarifa)','qa.m008.ag3@ketzal.local','agency',0);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token)
  values
    (v_admin_wl,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.admin1@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''),
    (v_admin_bo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.admin2@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''),
    (v_emb_ketzal,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.ketzal@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','',''),
    (v_emb_wl,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
     'qa.m008.wl@ketzal.local', crypt('x',gen_salt('bf')),now(),now(),now(),'','','','','','','','');

  insert into ketzal.profiles (id,email,name,role,supplier_id,type,active) values
    (v_admin_wl,'qa.m008.admin1@ketzal.local','QA Admin 1','admin',v_wl,'agente',true),
    (v_admin_bo,'qa.m008.admin2@ketzal.local','QA Admin 2','admin',v_bo,'agente',true);
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
  -- La agencia 3 se crea aquí, vacía a propósito. Antes el caso tomaba
  -- «cualquier otra agencia» del catálogo: eso depende de qué haya en la BD, y
  -- el día que esa otra agencia SÍ tenga tarifa el caso reporta un hueco falso.
  -- Mismo mal que clavar cifras del catálogo (ADR-0023).
  select count(*) into n from ketzal.resolve_commission_rule(null,'embajador',v_emb_wl, v_sin_tarifa);
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
  -- Sin limpieza a mano: el `rollback` del final revierte TODO. El borrado por
  -- predicado que vivía aquí es lo que se llevó las tarifas reales del fundador.
end $$;

select caso, veredicto from qa order by caso;

rollback;  -- un hard-test NUNCA commitea (2026-09-01)