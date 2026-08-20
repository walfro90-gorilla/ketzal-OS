-- HARD TESTING — simulación de 1000 operaciones con invariantes en cada paso.
--
-- Complementa a `hard_testing_dinero.sql` (casos dirigidos) y a
-- `money_invariants.sql` (chequeo puntual): esto es model-based testing — una
-- caminata aleatoria por todo el dominio de dinero verificando las invariantes
-- DESPUÉS DE CADA OPERACIÓN, no sólo al final. Cuando algo truena sabes la
-- operación exacta, no "algo entre la 1 y la 1000".
--
-- Uso: pegar en el SQL editor / execute_sql. Termina SIEMPRE con un RAISE que
-- revierte todo: no deja un byte escrito. El resultado viaja en el mensaje.
-- `setseed(0.42)` ⇒ reproducible; cambia la semilla para explorar otros caminos.
--
-- ══ DOS TRAMPAS QUE LA HICIERON SALIR VERDE SIN PROBAR NADA ══
--
-- 1. CORRERLA COMO SUPERADMIN. No tiene agencia, así que
--    `create_booking_with_items` deriva `selling_supplier_id = null` (agente
--    libre): sin agencia no hay comisiones ni créditos, el ledger se queda
--    VACÍO y "suma = 0" se cumple trivialmente sobre 0 filas. Por eso el actor
--    de cada operación es un ADMIN DE AGENCIA, alternando entre las dos, y el
--    40% de las ventas usan el servicio de la OTRA agencia para forzar reventa
--    ⇒ comisión ⇒ asientos en el ledger.
--
-- 2. `round(double precision, integer)` NO EXISTE. `numeric * random()` da
--    double, así que `round(v_saldo * random(), 2)` revienta y se come el 26%
--    de las operaciones — con el `exception when others` tragándose el error
--    como si fuera un guard de negocio. Castear a ::numeric.
--
-- SIEMPRE mirar la línea COBERTURA al terminar: si ledger/commission_lines/
-- credits salen en 0, la corrida no probó el ledger, diga lo que diga
-- "VIOLACIONES: 0".
--
-- ══ RESULTADO DE REFERENCIA (2026-08-19, semilla 0.42) ══
--   ops ok=778 err=222 · ledger=60 asientos · commission_lines=54 · credits=37
--   VIOLACIONES: 0. Los 222 "errores" son guards legítimos disparando:
--     87 sin cupo · ~50 excede saldo pendiente · ~35 reembolso excede lo pagado
--     44 solo el titular/agencia emisora aplica el crédito (b051) · 21 crédito ajeno
--
-- OJO: corre con permisos de servicio ⇒ NO prueba RLS ni autorización; los
-- guards de `auth.uid()` se simulan con `set request.jwt.claim.sub`. Para
-- autorización de verdad: `carreras_dinero.mjs` (JWT real por HTTP).
--
-- AJUSTAR los UUID del bloque de constantes a la BD donde se corra.

do $$
declare
  -- ── constantes a ajustar por entorno ──────────────────────────────────────
  v_agA uuid := 'e9289a23-c174-45f7-8601-3c86be99fc40'; -- agencia A
  v_agB uuid := 'dd46052b-4278-4661-968e-a7cec7b70f25'; -- agencia B
  v_uA  uuid := 'd23a16ca-e57a-417e-8744-395cc767cb1c'; -- admin de A
  v_uB  uuid := '2461313f-9eeb-4319-bf0f-ff4db6066346'; -- admin de B
  v_svcA uuid := 'f351aca4-f455-4cf8-a53c-7faf7263a5d1'; v_fA date := '2026-10-30';
  v_svcB uuid := '45e0a7bb-8e11-482e-8a92-5ec32208aa4d'; v_fB date := '2027-01-30';
  v_persona uuid := 'eb9afeb5-52bd-4071-9a9f-beceff9d7a22'; -- perfil viajero
  -- ──────────────────────────────────────────────────────────────────────────
  v_custA uuid[] := '{}'; v_custB uuid[] := '{}';
  v_actor uuid; v_miAg uuid; v_custs uuid[]; v_svc uuid; v_fecha date;
  v_i int; v_op int; v_b uuid; v_pay uuid; v_cred uuid; v_exp uuid;
  v_amt numeric; v_saldo numeric; v_c uuid;
  v_ok int := 0; v_err int := 0;
  v_errs jsonb := '{}'::jsonb; v_ops jsonb := '{}'::jsonb;
  v_label text; v_key text; v_fallas text[] := '{}';
  v_gl numeric; v_grp int; v_neg int; v_over int; v_f3 int; v_com int;
  v_fix record; v_n_led int; v_n_com int; v_n_cred int;
begin
  perform setseed(0.42);
  update ketzal.suppliers set commission_rate = 12 where id in (v_agA, v_agB);

  -- Clientes por agencia; la MISMA persona en las dos ⇒ canje cruzado posible.
  for v_fix in select * from (values
      ('A'::text, v_agA, v_persona), ('A', v_agA, null::uuid),
      ('B', v_agB, v_persona),       ('B', v_agB, null::uuid)
    ) t(lado, ag, persona)
  loop
    insert into ketzal.customers(supplier_id, created_by, full_name, marketplace_customer_id)
    values (v_fix.ag, v_uA, 'SIM '||v_fix.lado||' '||coalesce(v_fix.persona::text,'anon'), v_fix.persona)
    returning id into v_c;
    if v_fix.lado = 'A' then v_custA := v_custA || v_c; else v_custB := v_custB || v_c; end if;
  end loop;

  for v_i in 1..1000 loop
    v_op := floor(random()*100)::int; v_label := null;
    if random() < 0.5 then v_actor := v_uA; v_miAg := v_agA; v_custs := v_custA;
    else v_actor := v_uB; v_miAg := v_agB; v_custs := v_custB; end if;
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    if random() < 0.4 then   -- 40% reventa: vende el servicio de la otra agencia
      if v_miAg = v_agA then v_svc := v_svcB; v_fecha := v_fB; else v_svc := v_svcA; v_fecha := v_fA; end if;
    else
      if v_miAg = v_agA then v_svc := v_svcA; v_fecha := v_fA; else v_svc := v_svcB; v_fecha := v_fB; end if;
    end if;

    begin
      if v_op < 24 then
        v_label := 'crear_venta';
        v_b := ketzal.create_booking_with_items(v_custs[1+floor(random()*2)::int], null,
          v_svc, v_fecha, 0, 'sim',
          jsonb_build_array(jsonb_build_object('item_type','passenger','passenger_type','adult',
            'qty',1,'unit_price',round((random()*4000+500)::numeric,2))),'reserved');
      elsif v_op < 28 then
        v_label := 'crear_cotizacion';
        v_b := ketzal.create_booking_with_items(v_custs[1+floor(random()*2)::int], null,
          null,null,0,'sim cot',
          jsonb_build_array(jsonb_build_object('item_type','passenger','passenger_type','adult',
            'qty',1,'unit_price',round((random()*3000+500)::numeric,2))),'draft');
      elsif v_op < 52 then
        v_label := 'abono';
        select b.id, bb.balance into v_b, v_saldo
          from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
         where b.status in ('reserved','confirmed') and bb.balance>0
           and b.selling_supplier_id = v_miAg order by random() limit 1;
        if v_b is null then v_label := 'abono_sin_candidato'; else
          -- 15% intenta SOBREPAGAR a propósito: debe rebotar.
          v_amt := case when random()<0.15 then round(v_saldo*1.5,2)
                        else round(v_saldo*(0.2+random()*0.8)::numeric,2) end;
          if v_amt>0 then perform ketzal.register_payment(v_b,v_amt,'efectivo',now(),'payment'); end if;
        end if;
      elsif v_op < 58 then
        v_label := 'recibo';
        select p.id into v_pay from ketzal.payments p
         where p.type='payment' and p.status='COMPLETED' and p.supplier_id = v_miAg
           and not exists (select 1 from ketzal.receipts r where r.payment_id=p.id)
         order by random() limit 1;
        if v_pay is null then v_label := 'recibo_sin_candidato'; else perform ketzal.emit_receipt(v_pay); end if;
      elsif v_op < 63 then
        v_label := 'devolucion_total';
        select p.id into v_pay from ketzal.payments p
         where p.type='payment' and p.status='COMPLETED' and p.supplier_id = v_miAg
           and coalesce(p.payment_method,'')<>'credito'
           and not exists (select 1 from ketzal.payments r where r.refunds_payment_id=p.id)
         order by random() limit 1;
        if v_pay is null then v_label := 'devolucion_sin_candidato'; else perform ketzal.refund_payment(v_pay); end if;
      elsif v_op < 68 then
        v_label := 'devolucion_parcial';
        select p.id, p.amount_mxn into v_pay, v_amt from ketzal.payments p
         where p.type='payment' and p.status='COMPLETED' and p.supplier_id = v_miAg
           and coalesce(p.payment_method,'')<>'credito'
           and not exists (select 1 from ketzal.payments r where r.refunds_payment_id=p.id)
         order by random() limit 1;
        if v_pay is null then v_label := 'devolucion_parcial_sin_candidato';
        else perform ketzal.refund_payment_partial(v_pay, round(v_amt*0.4,2)); end if;
      elsif v_op < 78 then
        v_label := 'cancelar';
        select id into v_b from ketzal.bookings
         where status in ('reserved','confirmed','paid') and selling_supplier_id = v_miAg
         order by random() limit 1;
        if v_b is null then v_label := 'cancelar_sin_candidato';
        else perform ketzal.cancel_booking_v2(v_b,'sim',
               case when random()<0.6 then 'credito' else 'efectivo' end, random()<0.2); end if;
      elsif v_op < 87 then
        v_label := 'canje_credito';
        select c.id into v_cred from ketzal.credits c
         where c.amount_mxn - coalesce((select sum(amount_mxn) from ketzal.payments
                where credit_id=c.id and status='COMPLETED'),0) > 0
           and current_date < c.expires_at order by random() limit 1;
        select b.id, bb.balance into v_b, v_saldo
          from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
         where b.status in ('reserved','confirmed') and bb.balance>0
           and b.selling_supplier_id = v_miAg order by random() limit 1;
        if v_cred is null or v_b is null then v_label := 'canje_sin_candidato'; else
          select least(v_saldo, c.amount_mxn - coalesce((select sum(amount_mxn) from ketzal.payments
                   where credit_id=c.id and status='COMPLETED'),0)) into v_amt
            from ketzal.credits c where c.id=v_cred;
          if v_amt>0 then perform ketzal.redeem_credit(v_cred,v_b,round(v_amt,2)); end if;
        end if;
      elsif v_op < 91 then
        v_label := 'plan_generar';
        select b.id into v_b from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
         where b.status='reserved' and bb.balance>0 and b.selling_supplier_id = v_miAg
         order by random() limit 1;
        if v_b is null then v_label := 'plan_sin_candidato';
        else perform ketzal.generate_payment_plan(v_b,'quincenal',(current_date+90)::date,0.20); end if;
      elsif v_op < 94 then
        v_label := 'plan_quitar';
        select ps.booking_id into v_b from ketzal.payment_schedule ps
          join ketzal.bookings b on b.id=ps.booking_id
         where b.selling_supplier_id = v_miAg order by random() limit 1;
        if v_b is null then v_label := 'plan_quitar_sin_candidato'; else perform ketzal.clear_payment_plan(v_b); end if;
      elsif v_op < 98 then
        v_label := 'gasto';
        perform ketzal.create_expense('sim gasto','operacion',round((random()*2000+100)::numeric,2),
          'efectivo',current_date,null,null,null);
      else
        v_label := 'gasto_reverso';
        select e.id into v_exp from ketzal.expenses e
         where e.kind='egreso' and e.supplier_id = v_miAg
           and not exists (select 1 from ketzal.expenses r where r.reverses_expense_id=e.id)
         order by random() limit 1;
        if v_exp is null then v_label := 'gasto_reverso_sin_candidato'; else perform ketzal.reverse_expense(v_exp,'sim'); end if;
      end if;
      v_ok := v_ok+1;
      v_ops := jsonb_set(v_ops, array[v_label], to_jsonb(coalesce((v_ops->>v_label)::int,0)+1));
    exception when others then
      v_err := v_err+1; v_key := left(sqlerrm,50);
      v_errs := jsonb_set(v_errs, array[v_key], to_jsonb(coalesce((v_errs->>v_key)::int,0)+1));
    end;

    -- ── invariantes baratas: cada paso ──
    select coalesce(sum(amount_mxn),0) into v_gl from ketzal.ledger_entries;
    if round(v_gl,2)<>0 then v_fallas := v_fallas||format('paso %s tras %s: ledger global=%s',v_i,v_label,v_gl); end if;
    select count(*) into v_grp from (select group_id from ketzal.ledger_entries
      group by group_id having round(sum(amount_mxn),2)<>0) g;
    if v_grp>0 then v_fallas := v_fallas||format('paso %s tras %s: %s grupos desbalanceados',v_i,v_label,v_grp); end if;
    select count(*) into v_neg from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
     where b.status<>'cancelled' and bb.balance < -0.005;
    if v_neg>0 then v_fallas := v_fallas||format('paso %s tras %s: %s ventas con SOBREPAGO',v_i,v_label,v_neg); end if;

    -- ── invariantes caras: cada 25 ──
    if v_i % 25 = 0 then
      select count(*) into v_over from ketzal.credits c
       where coalesce((select sum(amount_mxn) from ketzal.payments where credit_id=c.id and status='COMPLETED'),0)
             > c.amount_mxn + 0.005;
      if v_over>0 then v_fallas := v_fallas||format('paso %s: %s creditos SOBRE-CANJEADOS',v_i,v_over); end if;
      -- F3 (b056): el saldo `viajero` del ledger debe ser Σ créditos sin canjear.
      select count(*) into v_f3 from (
        select 1 from
          (select account_profile_id p, sum(amount_mxn) saldo from ketzal.ledger_entries
            where account_type='viajero' group by account_profile_id) l
        full join
          (select cu.marketplace_customer_id p,
                  sum(c.amount_mxn - coalesce((select sum(amount_mxn) from ketzal.payments
                        where credit_id=c.id and status='COMPLETED'),0)) saldo
             from ketzal.credits c join ketzal.customers cu on cu.id=c.customer_id
            where cu.marketplace_customer_id is not null group by cu.marketplace_customer_id) k
        on k.p=l.p where round(coalesce(l.saldo,0)-coalesce(k.saldo,0),2)<>0) d;
      if v_f3>0 then v_fallas := v_fallas||format('paso %s: %s personas con ledger<>creditos (F3)',v_i,v_f3); end if;
      -- Toda commission_line debe tener espejo, salvo la auto-comisión de la vendedora.
      select count(*) into v_com from ketzal.commission_lines cl
       where not exists (select 1 from ketzal.ledger_entries le where le.commission_line_id = cl.id)
         and exists (select 1 from ketzal.bookings b where b.id=cl.booking_id and b.selling_supplier_id is not null)
         and not (cl.payee_type='agencia' and cl.payee_supplier_id =
                  (select selling_supplier_id from ketzal.bookings where id=cl.booking_id));
      if v_com>0 then v_fallas := v_fallas||format('paso %s: %s commission_lines SIN espejo',v_i,v_com); end if;
    end if;
  end loop;

  select count(*) into v_n_led from ketzal.ledger_entries;
  select count(*) into v_n_com from ketzal.commission_lines;
  select count(*) into v_n_cred from ketzal.credits;

  raise exception E'ROLLBACK-OK\nops ok=% err=%\nCOBERTURA: ledger=% asientos · commission_lines=% · credits=%\nOPS: %\nERRORES: %\nVIOLACIONES (%):\n  %',
    v_ok, v_err, v_n_led, v_n_com, v_n_cred, v_ops, v_errs,
    coalesce(array_length(v_fallas,1),0),
    coalesce(array_to_string(v_fallas[1:10], E'\n  '), 'NINGUNA');
end $$;
