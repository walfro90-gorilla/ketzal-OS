-- Hard-test: CONVERSIÓN viajero → embajador (b087, ADR-0033).
--
-- Lo que se defiende: al cliente que se vuelve embajador no se le quita nada.
-- Sus compras, sus créditos y su voucher siguen siendo suyos porque los RPC del
-- viajero filtran por `auth.uid()`, no por `profiles.type`. Si algún día alguien
-- le mete un gate de persona a esas funciones, este harness truena.
--
-- Y el riesgo NUEVO que abre la conversión: quien ya te compró, ahora con código
-- propio, es exactamente quien puede intentar auto-referirse. b079 cerró ese
-- guard por `marketplace_customer_id`; aquí se verifica sobre el caso que lo
-- hace probable.
--
-- Todo corre dentro de un DO que termina en `raise exception`: Postgres revierte
-- la transacción completa, así que no deja fixtures ni toca el append-only
-- (`commission_lines`/`ledger_entries` no se pueden borrar, pero sí revertir).
--
-- Correr con: mcp__claude_ai_Supabase__execute_sql (o psql -f). Espera
-- "CONVERSION -- N ok, 0 fail".

do $$
declare
  v_ag   uuid := 'aaaa0087-0000-4000-8000-000000000001';
  v_svc  uuid := 'bbbb0087-0000-4000-8000-000000000001';
  v_cli  uuid := 'cccc0087-0000-4000-8000-000000000001';
  b1     uuid := 'dddd0087-0000-4000-8000-00000000000a';
  b2     uuid := 'dddd0087-0000-4000-8000-00000000000b';
  v_p    uuid;
  j jsonb; n int; ok int := 0; fails int := 0; det text := '';
begin
  -- Un viajero real, con una compra confirmada suya.
  select id into v_p from ketzal.profiles where type = 'viajero' limit 1;
  if v_p is null then raise exception 'CONVERSION -- no hay ningún viajero con el que probar'; end if;

  insert into ketzal.suppliers(id, name, contact_email, supplier_type, commission_rate)
    values (v_ag, 'QA087 Agencia', 'qa087@qa.test', 'agency', 0);
  insert into ketzal.services(id, supplier_id, name, price)
    values (v_svc, v_ag, 'QA087 Tour', 3000);
  insert into ketzal.customers(id, supplier_id, full_name)
    values (v_cli, v_ag, 'QA087 Cliente');
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel)
    values (b1, v_ag, v_ag, v_cli, v_svc, v_p, 1, 3000, 0, 3000, 'confirmed', 'portal');

  perform set_config('request.jwt.claims', json_build_object('sub', v_p)::text, true);

  -- ---------- ANTES de convertirlo: línea base ----------
  set local role authenticated;
  j := ketzal.list_my_marketplace_orders();
  select count(*) into n from jsonb_array_elements(j) e where e->>'booking_id' = b1::text;
  if n = 1 then ok := ok + 1;
  else fails := fails + 1; det := det || ' [1 el viajero no ve su propia compra: fixture mal armada]'; end if;
  reset role;

  -- ---------- La conversión ----------
  update ketzal.profiles
     set type = 'embajador', referral_code = 'QA087CONV', active = true
   where id = v_p;

  set local role authenticated;

  j := ketzal.list_my_marketplace_orders();
  select count(*) into n from jsonb_array_elements(j) e where e->>'booking_id' = b1::text;
  if n = 1 then ok := ok + 1;
  else fails := fails + 1; det := det || ' [2 al convertirse PIERDE sus compras]'; end if;

  begin
    j := ketzal.list_my_credits(); ok := ok + 1;
  exception when others then
    fails := fails + 1; det := det || format(' [3 sus créditos truenan: %s]', sqlerrm);
  end;

  begin
    j := ketzal.get_my_trip(b1);
    if j is not null and j <> 'null'::jsonb then ok := ok + 1;
    else fails := fails + 1; det := det || ' [4 get_my_trip ya no le devuelve su viaje]'; end if;
  exception when others then
    fails := fails + 1; det := det || format(' [4 get_my_trip: %s]', sqlerrm);
  end;

  begin
    perform ketzal.emit_my_voucher(b1); ok := ok + 1;
  exception when others then
    if sqlerrm ilike '%viajero%' or sqlerrm ilike '%permis%' or sqlerrm ilike '%autoriz%' then
      fails := fails + 1; det := det || format(' [5 el voucher lo bloquea por persona: %s]', sqlerrm);
    else
      ok := ok + 1;  -- otra causa (ya emitido, sin pasajeros…) no es un gate de persona
    end if;
  end;
  reset role;

  -- ---------- El riesgo nuevo: comprarse a sí mismo con su código ----------
  insert into ketzal.bookings(id, selling_supplier_id, owner_supplier_id, customer_id, service_id,
                              marketplace_customer_id, num_pax, subtotal, discount, total, status, channel)
    values (b2, v_ag, v_ag, v_cli, v_svc, v_p, 1, 3000, 0, 3000, 'draft', 'portal');
  begin
    perform ketzal.attribute_booking_by_ref(b2, 'QA087CONV');
  exception when others then null;  -- rechazar lanzando también es rechazar
  end;
  select count(*) into n from ketzal.bookings where id = b2 and ambassador_id = v_p;
  if n = 0 then ok := ok + 1;
  else fails := fails + 1; det := det || ' [6 AUTO-REFERIDO: se atribuyó su propia compra]'; end if;

  raise exception 'CONVERSION -- % ok, % fail.%  (revertido)',
    ok, fails, coalesce(nullif(det, ''), ' Sin fallas.');
end $$;
