-- Hard-test del motor de comisiones (b019). REPLAYABLE: todo en una transacción
-- que se REVIERTE (rollback). No deja rastro. Deriva el uid superadmin dinámicamente.
--
--   psql "$DATABASE_URL" -f supabase/tests/comisiones_motor.sql
--
-- Cubre: snapshot por flujo (directa/reventa/libre/marketplace), embajador
-- (add/idempotente/invariante/sin-tarifa/no-embajador), inmutabilidad, guard
-- NULL-safe, self-attribution del comprador marketplace, y el health-check.

begin;

do $$
declare
  v_super uuid;
  v_buyer uuid;
  v_alfa  uuid := 'aaaa0000-0000-0000-0000-000000000001';  -- agencia dueña (12%)
  v_beta  uuid := 'aaaa0000-0000-0000-0000-000000000002';  -- agencia revendedora
  v_ivo   uuid := 'aaaa0000-0000-0000-0000-000000000003';  -- embajador con tarifa
  v_svc   uuid := 'bbbb0000-0000-0000-0000-000000000001';  -- tour de Alfa (tiene regla emb)
  v_svc2  uuid := 'bbbb0000-0000-0000-0000-000000000002';  -- tour de Alfa (SIN regla emb)
  v_cli   uuid := 'cccc0000-0000-0000-0000-000000000001';
  bA uuid := 'dddd0000-0000-0000-0000-00000000000a';  -- directa    → 0 líneas
  bB uuid := 'dddd0000-0000-0000-0000-00000000000b';  -- reventa    → agencia (cobra Beta, 12%)
  bC uuid := 'dddd0000-0000-0000-0000-00000000000c';  -- libre      → plataforma 10%
  bD uuid := 'dddd0000-0000-0000-0000-00000000000d';  -- marketplace→ plataforma (hueco #1)
  bS uuid := 'dddd0000-0000-0000-0000-000000000099';  -- chica t=100 (invariante)
  bE uuid := 'dddd0000-0000-0000-0000-0000000000ee';  -- en svc2 SIN regla emb
  v uuid; ok boolean; n int; s numeric;
  fails int := 0;
begin
  select id into v_super from ketzal.profiles where role='superadmin' and active limit 1;
  select id into v_buyer from auth.users limit 1;
  if v_super is null then raise exception 'No hay superadmin para el test'; end if;

  -- ---- semilla (como owner postgres) ----
  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate) values
    (v_alfa,'QA Alfa','alfa@qa.test','agency',12),
    (v_beta,'QA Beta','beta@qa.test','agency',0),
    (v_ivo ,'QA Ivo' ,'ivo@qa.test' ,'embajador',0);
  insert into ketzal.services(id,supplier_id,name,price) values
    (v_svc ,v_alfa,'QA Tour' ,1000),
    (v_svc2,v_alfa,'QA Tour2',1000);
  insert into ketzal.customers(id,supplier_id,full_name) values (v_cli,v_alfa,'QA Cli');
  insert into ketzal.commission_rules(service_id,payee_type,scope_supplier_id,basis,unit_amount)
    values (v_svc,'embajador',v_ivo,'fijo_pax',150);
  insert into ketzal.marketplace_customers(id,full_name,email) values (v_buyer,'QA Comprador','c@qa.test')
    on conflict (id) do nothing;

  -- ---- flujos de snapshot ----
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,sold_by,num_pax,subtotal,discount,total,status)
    values (bA,v_alfa,v_alfa,v_cli,v_svc,v_super,2,2000,0,2000,'reserved'),         -- directa
           (bB,v_beta,v_alfa,v_cli,v_svc,v_super,2,2000,0,2000,'reserved'),         -- reventa
           (bC,null ,v_alfa,v_cli,v_svc,v_super,2,2000,0,2000,'reserved'),          -- libre
           (bS,v_alfa,v_alfa,v_cli,v_svc ,v_super,2, 100,0, 100,'reserved'),        -- chica
           (bE,v_alfa,v_alfa,v_cli,v_svc2,v_super,2,2000,0,2000,'reserved');        -- svc2 sin regla emb
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,marketplace_customer_id,service_id,num_pax,subtotal,discount,total,status)
    values (bD,v_alfa,v_alfa,v_cli,v_buyer,v_svc,2,2000,0,2000,'draft');            -- marketplace
  update ketzal.bookings set status='reserved' where id=bD;                          -- simula confirm_online_payment

  -- A: directa → 0 líneas
  select count(*)=0 into ok from ketzal.commission_lines where booking_id=bA;
  if not ok then fails:=fails+1; raise warning 'FAIL A: directa debería tener 0 líneas'; end if;
  -- B: reventa → 1 línea agencia, cobra Beta (revendedor), 12% (tasa dueña) = 240
  select count(*)=1 and bool_and(payee_type='agencia' and payee_supplier_id=v_beta and amount_mxn=240)
    into ok from ketzal.commission_lines where booking_id=bB;
  if not ok then fails:=fails+1; raise warning 'FAIL B: reventa'; end if;
  -- C: libre → plataforma 10% = 200
  select count(*)=1 and bool_and(payee_type='plataforma' and payee_supplier_id is null and amount_mxn=200)
    into ok from ketzal.commission_lines where booking_id=bC;
  if not ok then fails:=fails+1; raise warning 'FAIL C: libre'; end if;
  -- D: marketplace → plataforma 10% = 200 (HUECO #1 cerrado)
  select count(*)=1 and bool_and(payee_type='plataforma' and amount_mxn=200)
    into ok from ketzal.commission_lines where booking_id=bD;
  if not ok then fails:=fails+1; raise warning 'FAIL D: marketplace no dejó comisión de plataforma'; end if;

  -- ---- embajador (como authenticated superadmin) ----
  perform set_config('request.jwt.claims', json_build_object('sub',v_super::text,'role','authenticated')::text, true);

  v := ketzal.set_booking_ambassador(bA, v_ivo);                 -- add: 150*2 = 300
  if v is null then fails:=fails+1; raise warning 'FAIL T1: embajador add'; end if;
  if ketzal.set_booking_ambassador(bA, v_ivo) <> v then         -- idempotente
     fails:=fails+1; raise warning 'FAIL T2: no idempotente'; end if;
  select count(*), coalesce(sum(amount_mxn),0) into n,s
    from ketzal.commission_lines where booking_id=bA and payee_type='embajador';
  if n<>1 or s<>300 then fails:=fails+1; raise warning 'FAIL T3: línea emb n=% s=%',n,s; end if;

  -- invariante: 300 > total 100 → raise
  begin perform ketzal.set_booking_ambassador(bS, v_ivo);
    fails:=fails+1; raise warning 'FAIL T5: invariante no bloqueó';
  exception when others then null; end;
  -- sin tarifa: bE está en svc2, que no tiene regla de embajador → raise
  begin perform ketzal.set_booking_ambassador(bE, v_ivo);
    fails:=fails+1; raise warning 'FAIL T6: sin-tarifa no bloqueó';
  exception when others then null; end;

  -- no-embajador: pasar una agencia como embajador → raise
  begin perform ketzal.set_booking_ambassador(bC, v_alfa);
    fails:=fails+1; raise warning 'FAIL T7: no-embajador no bloqueó';
  exception when others then null; end;

  -- inmutabilidad: DELETE bloqueado por el trigger no_mutar (aplica a todos, incl. owner)
  begin delete from ketzal.commission_lines where booking_id=bA;
    fails:=fails+1; raise warning 'FAIL T8: delete no bloqueado';
  exception when others then null; end;

  -- guard NULL-safe: extraño sin agencia → Sin permiso
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}',true);
  begin perform ketzal.set_booking_ambassador(bC, v_ivo);
    fails:=fails+1; raise warning 'FAIL T9: guard no bloqueó a extraño';
  exception when others then null; end;

  if fails=0 then raise notice '✅ comisiones_motor: todos los checks en verde';
  else raise exception '❌ comisiones_motor: % checks fallaron', fails; end if;
end $$;

rollback;
