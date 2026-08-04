-- b034 — Pago por transferencia SPEI directa (sin comisión de MP), con aprobación del admin.
-- Espejo de la migración aplicada `b034_spei`.
--
-- Diseño (acordado con el fundador):
--  · CLABE POR AGENCIA: vive en suppliers.info (spei_clabe/spei_banco/spei_titular) — sin DDL.
--  · SIN status nuevo de booking: el "pendiente de aprobación" vive en payment_intents
--    (provider='spei', status='pending'). La venta sigue draft hasta aprobar.
--  · Aprobar reusa la MISMA lógica de dinero que MP (confirm_online_payment): anti-sobrepago,
--    race-safe, draft→reserved con cupo, saldo→paid. Un solo camino de dinero.
--  · Alcance = igual que MP: siguiente abono o liquidar (el monto lo valida el RPC vs saldo).
--
-- Objetos:
--  1. confirm_online_payment: DROP + recreate con p_method default 'mercadopago' (firma vieja
--     desaparece; el webhook llama con named args ⇒ resuelve con el default). Grant solo
--     service_role (igual que antes) + resolve_spei_payment la llama internamente (DEFINER).
--  2. submit_spei_payment(booking, amount, reference): el COMPRADOR declara "ya transferí".
--     Crea/actualiza (dedupe) el intent spei pending. Guard: dueño del pedido, agencia con
--     CLABE, monto>0 y ≤ saldo, venta no cancelada.
--  3. list_pending_spei(): transferencias por confirmar de MI agencia (admin) o todas (superadmin).
--  4. resolve_spei_payment(intent, approve): admin de la agencia (is_agency_admin) o superadmin.
--     approve ⇒ confirm_online_payment(..., 'transferencia'); reject ⇒ status='rejected'.
--  5. list_my_marketplace_orders: re-apply ADITIVO desde el DDL vivo — +spei (datos bancarios de
--     la agencia vendedora si hay CLABE y saldo) +spei_pending (monto del intent en revisión).

-- 1) confirm_online_payment + p_method ───────────────────────────────────────
drop function if exists ketzal.confirm_online_payment(uuid, text, text);

create or replace function ketzal.confirm_online_payment(
  p_intent_id uuid, p_mp_payment_id text, p_status text, p_method text default 'mercadopago'
) returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_intent ketzal.payment_intents;
  v_pay uuid; v_balance numeric; v_apply numeric(12,2);
  v_bstatus ketzal.booking_status;
  v_seated boolean := true;
  v_user uuid;
begin
  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'intent_not_found'); end if;
  if v_intent.status = 'approved' then return jsonb_build_object('ok', true, 'already', true); end if;

  if p_status <> 'approved' then
    update ketzal.payment_intents set status = p_status, mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    return jsonb_build_object('ok', true, 'status', p_status);
  end if;

  -- Serializa confirmaciones concurrentes del mismo pedido (race-safe D1/F):
  -- la 2ª espera esta fila y re-lee saldo abajo, cayendo en el guard de sobrepago.
  perform 1 from ketzal.bookings where id = v_intent.booking_id for update;

  v_user := coalesce(v_intent.created_by, v_intent.marketplace_customer_id);
  select status into v_bstatus from ketzal.bookings where id = v_intent.booking_id;

  -- E5: pedido cancelado ⇒ no aplicar; loguear para reembolso (dinero en MP).
  if v_bstatus = 'cancelled' then
    update ketzal.payment_intents set status = 'approved', mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'pago_cancelado',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount));
    return jsonb_build_object('ok', true, 'cancelled', true, 'applied', 0);
  end if;

  -- D1: saldo restante antes de aplicar (anti-sobrepago).
  select balance into v_balance from ketzal.bookings_with_balance where id = v_intent.booking_id;
  if v_balance <= 0 then
    update ketzal.payment_intents set status = 'approved', mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'sobrepago',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount, 'aplicado', 0));
    return jsonb_build_object('ok', true, 'overpaid', true, 'applied', 0, 'balance', v_balance);
  end if;

  v_apply := least(v_intent.amount, round(v_balance, 2));

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, transaction_id, paid_at, installments, current_installment)
  values (v_intent.booking_id, v_intent.supplier_id, v_user, v_apply, 'COMPLETED', 'payment',
          p_method, p_mp_payment_id, now(), 1, 1)
  returning id into v_pay;

  update ketzal.payment_intents
    set status = 'approved', mp_payment_id = p_mp_payment_id, payment_id = v_pay, updated_at = now()
    where id = p_intent_id;

  if v_intent.amount > v_apply then
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'sobrepago',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount, 'aplicado', v_apply));
  end if;

  if v_bstatus = 'draft' then
    begin
      update ketzal.bookings set status = 'reserved'
        where id = v_intent.booking_id and status = 'draft';
    exception when others then
      v_seated := false;
      insert into ketzal.system_log(source, level, event, detail)
      values ('mp_confirm', 'warn', 'pagado_sin_cupo',
        jsonb_build_object('booking_id', v_intent.booking_id, 'payment_id', v_pay,
          'mp_payment_id', p_mp_payment_id, 'motivo', SQLERRM));
    end;
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = v_intent.booking_id;

  if v_seated then
    update ketzal.bookings set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status else status end
      where id = v_intent.booking_id and status not in ('cancelled','paid');
  end if;

  return jsonb_build_object('ok', true, 'payment_id', v_pay, 'balance', v_balance, 'seated', v_seated, 'applied', v_apply);
end $function$;

revoke all on function ketzal.confirm_online_payment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function ketzal.confirm_online_payment(uuid, text, text, text) to service_role;

-- 2) submit_spei_payment ─────────────────────────────────────────────────────
create or replace function ketzal.submit_spei_payment(
  p_booking_id uuid, p_amount numeric, p_reference text default null
) returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_mc uuid; v_bstatus ketzal.booking_status;
  v_balance numeric; v_amount numeric(12,2);
  v_ref text; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select selling_supplier_id, marketplace_customer_id, status
    into v_supplier, v_mc, v_bstatus
    from ketzal.bookings where id = p_booking_id;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  if v_bstatus = 'cancelled' then raise exception 'Este pedido está cancelado.'; end if;

  -- La agencia debe aceptar SPEI (CLABE configurada en su perfil).
  if not exists (
    select 1 from ketzal.suppliers s
    where s.id = v_supplier and coalesce(s.info->>'spei_clabe','') <> ''
  ) then
    raise exception 'Esta agencia no acepta transferencia directa.';
  end if;

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking_id;
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then raise exception 'Monto inválido.'; end if;
  if v_amount > round(coalesce(v_balance, 0), 2) then
    raise exception 'El monto (%) excede el saldo pendiente (%).', v_amount, round(coalesce(v_balance,0),2);
  end if;

  v_ref := nullif(left(btrim(coalesce(p_reference,'')), 64), '');

  -- Dedupe: un solo intent spei pendiente por pedido — reintentar actualiza, no apila.
  select id into v_id from ketzal.payment_intents
    where booking_id = p_booking_id and provider = 'spei' and status = 'pending'
    limit 1;
  if v_id is not null then
    update ketzal.payment_intents
      set amount = v_amount, mp_payment_id = v_ref, updated_at = now()
      where id = v_id;
  else
    insert into ketzal.payment_intents(booking_id, supplier_id, created_by, marketplace_customer_id,
                                       amount, provider, mp_payment_id, status)
    values (p_booking_id, v_supplier, null, v_uid, v_amount, 'spei', v_ref, 'pending')
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $function$;

revoke all on function ketzal.submit_spei_payment(uuid, numeric, text) from public, anon;
grant execute on function ketzal.submit_spei_payment(uuid, numeric, text) to authenticated, service_role;

-- 3) list_pending_spei ───────────────────────────────────────────────────────
create or replace function ketzal.list_pending_spei()
 returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_super boolean := ketzal.is_superadmin();
  v_supplier uuid := ketzal.my_supplier_id();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not v_super and not exists (
    select 1 from ketzal.profiles p
    where p.id = v_uid and p.role = 'admin' and p.active
  ) then
    raise exception 'Solo un admin puede revisar transferencias.';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
    from (
      select pi.id, pi.booking_id, pi.amount, pi.mp_payment_id as reference, pi.created_at,
             coalesce(c.full_name, 'Comprador') as cliente,
             coalesce(sv.name, 'Viaje') as servicio,
             b.status::text as booking_status,
             bwb.total, bwb.balance
      from ketzal.payment_intents pi
      join ketzal.bookings b on b.id = pi.booking_id
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.customers c on c.id = b.customer_id
      left join ketzal.services sv on sv.id = b.service_id
      where pi.provider = 'spei' and pi.status = 'pending'
        and (v_super or pi.supplier_id = v_supplier)
    ) x
  );
end $function$;

revoke all on function ketzal.list_pending_spei() from public, anon;
grant execute on function ketzal.list_pending_spei() to authenticated, service_role;

-- 4) resolve_spei_payment ────────────────────────────────────────────────────
create or replace function ketzal.resolve_spei_payment(p_intent_id uuid, p_approve boolean)
 returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_intent ketzal.payment_intents;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found or v_intent.provider <> 'spei' or v_intent.status <> 'pending' then
    raise exception 'Transferencia no encontrada o ya resuelta.';
  end if;

  if not ketzal.is_superadmin() and not ketzal.is_agency_admin(v_intent.supplier_id) then
    raise exception 'Solo el admin de la agencia puede resolver esta transferencia.';
  end if;

  if not p_approve then
    update ketzal.payment_intents set status = 'rejected', updated_at = now()
      where id = p_intent_id;
    return jsonb_build_object('ok', true, 'rejected', true);
  end if;

  -- Aprobado: mismo camino de dinero que MP (ledger + cupo + saldo→paid).
  return ketzal.confirm_online_payment(
    p_intent_id, coalesce(v_intent.mp_payment_id, 'spei-directo'), 'approved', 'transferencia');
end $function$;

revoke all on function ketzal.resolve_spei_payment(uuid, boolean) from public, anon;
grant execute on function ketzal.resolve_spei_payment(uuid, boolean) to authenticated, service_role;

-- 5) list_my_marketplace_orders — re-apply aditivo (+spei, +spei_pending) ────
create or replace function ketzal.list_my_marketplace_orders()
 returns jsonb
 language plpgsql stable security definer set search_path to 'ketzal','pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        b.id as booking_id, b.service_id, b.status::text as status, b.travel_date,
        b.payment_type, b.created_at,
        coalesce(sv.name, 'Viaje') as service_name,
        bwb.total, bwb.paid, bwb.balance,
        case
          when bwb.balance <= 0 then 0
          when b.payment_type = 'abonos' then coalesce((
            select least(bwb.balance, x.cum - bwb.paid)
            from (select ps.seq, sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) x
            where x.cum > bwb.paid order by x.seq limit 1
          ), bwb.balance)
          else bwb.balance
        end as next_due,
        case
          when bwb.balance > 0 and b.payment_type = 'abonos' then (
            select y.due_date
            from (select ps.seq, ps.due_date, sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) y
            where y.cum > bwb.paid order by y.seq limit 1)
          else null
        end as next_due_date,
        (b.status = 'paid' and (b.travel_date is null or b.travel_date <= current_date)) as can_rate,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as rated_provider,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as rated_app,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_rating,
        (select r.comment from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_comment,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as app_rating,
        -- b034: datos SPEI de la agencia vendedora (solo si hay saldo y CLABE configurada).
        case
          when bwb.balance > 0 and coalesce(sp.info->>'spei_clabe','') <> '' then
            jsonb_build_object(
              'clabe',   sp.info->>'spei_clabe',
              'banco',   sp.info->>'spei_banco',
              'titular', sp.info->>'spei_titular',
              'agencia', sp.name)
          else null
        end as spei,
        -- b034: transferencia declarada, en revisión del admin.
        (select pi.amount from ketzal.payment_intents pi
          where pi.booking_id = b.id and pi.provider = 'spei' and pi.status = 'pending'
          limit 1) as spei_pending
      from ketzal.bookings b
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.services sv on sv.id = b.service_id
      left join ketzal.suppliers sp on sp.id = b.selling_supplier_id
      where b.marketplace_customer_id = v_uid and b.status <> 'cancelled'
    ) o
  );
end $function$;
