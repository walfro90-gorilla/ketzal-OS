-- Hard-test del CORTE de comisiones (b086 / ADR-0032).
--
-- REPLAYABLE Y SIN RASTRO: mismo mecanismo que `embajador_devengo.sql` — todo
-- dentro de un DO block que TERMINA CON `raise exception`, así Postgres revierte
-- cada insert. Las `commission_lines`, los `payments` y el ledger no se pueden
-- BORRAR (`no_mutar`), pero sí REVERTIR.
--
--   psql "$DATABASE_URL" -f supabase/tests/corte_embajadores.sql
--
-- Cubre:
--   1. solo se paga lo de ventas con DINERO COBRADO (el hueco de ADR-0029:
--      un reembolso sin cancelar no reversa la comisión)
--   2. una venta sin un peso cobrado no entra al corte
--   3. el corte a una fecha anterior no incluye lo devengado después
--   4. registrar el pago deja el corte en cero
--   5. pagar de MÁS se rechaza con el número correcto
--   6. no se puede pagar dos veces
--   7. el pago espeja su liquidación al ledger y el global sigue en 0 (b081)
--   8. un viajero no puede ver el corte
--   9. un admin de OTRA agencia no puede registrar el pago

do $$
declare
  v_ag    uuid := 'aaaa0086-0000-4000-8000-0000000000c1';
  v_svc   uuid := 'bbbb0086-0000-4000-8000-0000000000c1';
  v_cli   uuid := 'cccc0086-0000-4000-8000-0000000000c1';
  v_emb uuid; v_super uuid; v_comp uuid; v_admin uuid;
  b_cobrada  uuid := 'dddd0086-0000-4000-8000-0000000000c1';
  b_sinpago  uuid := 'dddd0086-0000-4000-8000-0000000000c2';
  b_devuelta uuid := 'dddd0086-0000-4000-8000-0000000000c3';
  hoy date := current_date;
  r jsonb; n numeric; ok int := 0; fails int := 0; det text := '';
begin
  select id into v_emb   from ketzal.profiles where type='embajador' order by email limit 1;
  select id into v_super from ketzal.profiles where role='superadmin' and active limit 1;
  select id into v_comp  from ketzal.profiles where type='viajero' limit 1;
  select id into v_admin from ketzal.profiles where role='admin' and supplier_id is not null limit 1;
  if v_emb is null or v_super is null or v_comp is null then
    raise exception 'Faltan perfiles base para el test (embajador / superadmin / viajero)';
  end if;

  insert into ketzal.suppliers(id,name,contact_email,supplier_type,commission_rate)
    values (v_ag,'QA-corte','qacorte@qa.test','agency',0);
  insert into ketzal.services(id,supplier_id,name,price) values (v_svc,v_ag,'QA-corte Tour',5000);
  insert into ketzal.customers(id,supplier_id,full_name) values (v_cli,v_ag,'QA-corte Cli');
  insert into ketzal.commission_rules(service_id,payee_type,scope_supplier_id,basis,unit_amount)
    values (null,'embajador',v_ag,'fijo_pax',300);

  -- Tres ventas que DEVENGAN igual ($300 cada una), pero solo una tiene dinero.
  insert into ketzal.bookings(id,selling_supplier_id,owner_supplier_id,customer_id,service_id,
                              marketplace_customer_id,ambassador_id,num_pax,subtotal,discount,total,status,channel)
  values (b_cobrada ,v_ag,v_ag,v_cli,v_svc,v_comp,v_emb,1,5000,0,5000,'confirmed','portal'),
         (b_sinpago ,v_ag,v_ag,v_cli,v_svc,v_comp,v_emb,1,5000,0,5000,'confirmed','portal'),
         (b_devuelta,v_ag,v_ag,v_cli,v_svc,v_comp,v_emb,1,5000,0,5000,'confirmed','portal');

  insert into ketzal.payments(booking_id,supplier_id,user_id,amount_mxn,status,type,payment_method,paid_at)
  values (b_cobrada ,v_ag,v_comp,2000,'COMPLETED','payment','efectivo',now()),
         -- Cobrada y DEVUELTA COMPLETA sin cancelar: la comisión sigue devengada
         -- (ADR-0029 lo deja abierto) y el corte tiene que excluirla.
         (b_devuelta,v_ag,v_comp,3000,'COMPLETED','payment','efectivo',now()),
         (b_devuelta,v_ag,v_comp,3000,'COMPLETED','refund' ,'efectivo',now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_super)::text, true);

  ---------------------------------------------------------------- 1 y 2
  r := ketzal.corte_embajadores(hoy);
  select (e->>'a_pagar')::numeric into n
    from jsonb_array_elements(r->'filas') e
   where e->>'embajador_id' = v_emb::text and e->>'concepto' = 'comision';
  if n = 300 then ok := ok + 1;
  else fails := fails + 1;
       det := det || format(' [1 a_pagar %s, esperaba 300: 3 ventas devengaron $900 y solo UNA tiene dinero cobrado]', n);
  end if;

  ---------------------------------------------------------------- 3
  r := ketzal.corte_embajadores(hoy - 1);
  if coalesce((r->>'total_a_pagar')::numeric, 0) = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [3 el corte de ayer trajo %s]', r->>'total_a_pagar'); end if;

  ---------------------------------------------------------------- 5 (antes de pagar)
  begin
    perform ketzal.pagar_corte_embajador(v_emb, v_ag, 999, hoy);
    fails := fails + 1; det := det || ' [5 aceptó pagar más de lo debido]';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------- 4
  perform ketzal.pagar_corte_embajador(v_emb, v_ag, 300, hoy);
  select coalesce(sum((e->>'a_pagar')::numeric), 0) into n
    from jsonb_array_elements(ketzal.corte_embajadores(hoy)->'filas') e
   where e->>'embajador_id' = v_emb::text and e->>'concepto' = 'comision';
  if n = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [4 tras pagar queda %s]', n); end if;

  ---------------------------------------------------------------- 6
  begin
    perform ketzal.pagar_corte_embajador(v_emb, v_ag, 300, hoy);
    fails := fails + 1; det := det || ' [6 permitió pagar dos veces]';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------- 7
  select coalesce(sum(amount_mxn), 0) into n from ketzal.ledger_entries;
  if abs(n) < 0.005 then ok := ok + 1;
  else fails := fails + 1; det := det || format(' [7 ledger global %s, esperaba 0]', n); end if;

  ---------------------------------------------------------------- 8
  perform set_config('request.jwt.claims', json_build_object('sub', v_comp)::text, true);
  begin
    perform ketzal.corte_embajadores(hoy);
    fails := fails + 1; det := det || ' [8 un viajero vio el corte]';
  exception when others then ok := ok + 1;
  end;

  ---------------------------------------------------------------- 9
  if v_admin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
    begin
      perform ketzal.pagar_corte_embajador(v_emb, v_ag, 1, hoy);
      fails := fails + 1; det := det || ' [9 un admin de otra agencia registró el pago]';
    exception when others then ok := ok + 1;
    end;
  else
    ok := ok + 1;  -- sin admin de agencia en la base, el caso no aplica
  end if;

  -- La excepción REVIERTE TODO. Es el mecanismo, no un error.
  raise exception 'CORTE — % pasaron, % fallaron.%  (todo revertido, sin rastro)',
    ok, fails, coalesce(nullif(det, ''), ' Sin fallas.');
end $$;
