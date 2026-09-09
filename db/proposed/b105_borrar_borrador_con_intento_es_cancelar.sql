-- b105 — Un borrador con intento de pago se cancela, no se borra; los cancelados
-- sin dinero se esconden; un pago tardío sobre un cancelado avisa al superadmin.
--
-- Migración aplicada: `b105_borrar_borrador_con_intento_es_cancelar` (2026-09-09;
-- se aplicó como b104 y se renombró en schema_migrations al chocar con la b104
-- de perfil social, aplicada un minuto antes).
--
-- El viajero no podía eliminar dos borradores: `delete_my_draft_order`
-- bloqueaba con CUALQUIER fila en payment_intents, y las preferencias de MP
-- nacían sin expiración. El candado tenía razón de ser: borrar la fila con un
-- pago tardío en camino deja dinero en MP sin pedido (la FK payment_intents →
-- bookings no tiene on delete, y el webhook trataba intent_not_found como
-- éxito). Solución: soft-cancel.
--
--   · delete_my_draft_order: SPEI pendiente bloquea (pudo ya transferir); con
--     intentos MP se cancela el pedido y los pendientes pasan a 'abandoned'
--     (status es text sin CHECK; confirm_online_payment solo corta en 'approved');
--     sin intentos se borra como siempre.
--   · list_my_marketplace_orders: esconde cancelados sin ningún pago COMPLETED.
--   · confirm_online_payment: en la rama 'cancelled' deja notificación URGENT a
--     los superadmins (evento 'pago', link a la venta).
--
-- Re-aplicado desde el DDL vivo; solo cambian las líneas marcadas "b105".

CREATE OR REPLACE FUNCTION ketzal.delete_my_draft_order(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_mc uuid;
  v_status ketzal.booking_status;
  v_channel text;
  v_intents int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select marketplace_customer_id, status, channel into v_mc, v_status, v_channel
    from ketzal.bookings where id = p_booking_id for update;
  if not found or v_mc is null or v_mc <> v_uid then
    raise exception 'Pedido no encontrado o sin acceso';
  end if;
  -- b091: una cotización del back-office la borra su agente, no el viajero.
  if v_channel <> 'portal' then
    raise exception 'Esta cotización la lleva tu agencia: cualquier cambio va con ella.';
  end if;

  if v_status <> 'draft' then
    raise exception 'Solo puedes eliminar pedidos que sigan pendientes de pago.';
  end if;

  if exists (select 1 from ketzal.payments where booking_id = p_booking_id) then
    raise exception 'Este pedido ya tiene un pago registrado, no se puede eliminar.';
  end if;

  -- b105: una transferencia declarada puede ya venir en camino: la revisa la agencia.
  if exists (select 1 from ketzal.payment_intents
              where booking_id = p_booking_id and provider = 'spei' and status = 'pending') then
    raise exception 'Declaraste una transferencia y la agencia la está revisando. Espera su confirmación o escríbele antes de eliminar.';
  end if;

  select count(*) into v_intents from ketzal.payment_intents where booking_id = p_booking_id;
  if v_intents = 0 then
    delete from ketzal.bookings where id = p_booking_id;
  else
    -- b105: hubo un checkout de Mercado Pago que no terminó. La fila NO se borra:
    -- si el pago llega tarde, confirm_online_payment lo recibe en la rama
    -- 'cancelled' (marca el intento, aplica 0 y avisa) en vez de perderse como
    -- intent_not_found. Los intentos pendientes quedan abandonados y la lista
    -- del viajero esconde los cancelados sin dinero.
    update ketzal.payment_intents set status = 'abandoned', updated_at = now()
      where booking_id = p_booking_id and status = 'pending';
    update ketzal.bookings set status = 'cancelled' where id = p_booking_id;
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION ketzal.list_my_marketplace_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        b.id as booking_id, b.service_id, b.status::text as status, b.travel_date,
        b.payment_type, b.created_at,
        b.channel,
        coalesce(sv.name, 'Viaje') as service_name,
        bwb.total, bwb.paid, bwb.balance,
        (select coalesce(sum(p.amount_mxn), 0) from ketzal.payments p
          where p.booking_id = b.id and p.type = 'refund' and p.status = 'COMPLETED') as refunded,
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
        (b.status = 'paid' and b.travel_date is not null and b.travel_date <= current_date) as can_rate,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as rated_provider,
        exists(select 1 from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as rated_app,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_rating,
        (select r.comment from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_provider' and r.author_id=v_uid) as provider_comment,
        (select r.rating  from ketzal.ratings r where r.booking_id=b.id and r.kind='traveler_to_app' and r.author_id=v_uid) as app_rating,
        case
          when bwb.balance > 0 and coalesce(sp.info->>'spei_clabe','') <> '' then
            jsonb_build_object(
              'clabe',   sp.info->>'spei_clabe',
              'banco',   sp.info->>'spei_banco',
              'titular', sp.info->>'spei_titular',
              'cuenta',  sp.info->>'spei_cuenta',
              'tarjeta', sp.info->>'spei_tarjeta',
              'agencia', sp.name)
          else null
        end as spei,
        (select pi.amount from ketzal.payment_intents pi
          where pi.booking_id = b.id and pi.provider = 'spei' and pi.status = 'pending'
          limit 1) as spei_pending,
        case
          when b.payment_type = 'abonos' then (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'seq', z.seq, 'kind', z.kind, 'due_date', z.due_date,
                     'amount', z.amount, 'cum', z.cum) order by z.seq), '[]'::jsonb)
            from (select ps.seq, ps.kind, ps.due_date, ps.amount,
                         sum(ps.amount) over (order by ps.seq) as cum
                  from ketzal.payment_schedule ps where ps.booking_id = b.id) z
          )
          else null
        end as plan
      from ketzal.bookings b
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.services sv on sv.id = b.service_id
      left join ketzal.suppliers sp on sp.id = b.selling_supplier_id
      where b.marketplace_customer_id = v_uid
        -- b105: un cancelado por el que nunca entró dinero (borrador abandonado)
        -- no es historia del viajero: se esconde. Con pagos o devolución sí se ve.
        and not (b.status = 'cancelled'
                 and not exists (select 1 from ketzal.payments p
                                  where p.booking_id = b.id and p.status = 'COMPLETED'))
    ) o
  );
end $function$
;

CREATE OR REPLACE FUNCTION ketzal.confirm_online_payment(p_intent_id uuid, p_mp_payment_id text, p_status text, p_method text DEFAULT 'mercadopago'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ketzal', 'pg_temp'
AS $function$
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

  perform 1 from ketzal.bookings where id = v_intent.booking_id for update;

  v_user := coalesce(v_intent.created_by, v_intent.marketplace_customer_id);
  select status into v_bstatus from ketzal.bookings where id = v_intent.booking_id;

  if v_bstatus = 'cancelled' then
    update ketzal.payment_intents set status = 'approved', mp_payment_id = p_mp_payment_id, updated_at = now()
      where id = p_intent_id;
    insert into ketzal.system_log(source, level, event, detail)
    values ('mp_confirm', 'warn', 'pago_cancelado',
      jsonb_build_object('booking_id', v_intent.booking_id, 'intent', p_intent_id,
        'mp_payment_id', p_mp_payment_id, 'amount', v_intent.amount));
    -- b105: dinero real sobre un pedido cancelado no puede quedarse en un log:
    -- el superadmin lo ve en la campana y lo devuelve a mano.
    insert into ketzal.notifications(user_id, title, message, type, priority, metadata, action_url)
    select p.id,
           'Pago sobre un pedido cancelado',
           format('Mercado Pago aprobó $%s MXN del pedido %s, que ya estaba cancelado. Hay que devolverlo.',
                  to_char(v_intent.amount, 'FM999,999,990.00'), left(v_intent.booking_id::text, 8)),
           'WARNING', 'URGENT',
           jsonb_build_object('evento', 'pago', 'booking_id', v_intent.booking_id,
                              'intent', p_intent_id, 'mp_payment_id', p_mp_payment_id),
           '/ventas/' || v_intent.booking_id
    from ketzal.profiles p where p.role = 'superadmin' and p.active;
    return jsonb_build_object('ok', true, 'cancelled', true, 'applied', 0);
  end if;

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

  if p_method = 'mercadopago' and v_intent.supplier_id is not null then
    begin
      if v_intent.split then
        if coalesce(v_intent.mp_fee, 0) > 0 then
          perform ketzal.ledger_post(jsonb_build_array(
            jsonb_build_object('account_type','agencia','account_supplier_id', v_intent.supplier_id,
              'kind','fee_cobrado_split','amount_mxn', v_intent.mp_fee,
              'booking_id', v_intent.booking_id, 'payment_id', v_pay,
              'note','Fee cobrado en el split de MP'),
            jsonb_build_object('account_type','plataforma',
              'kind','fee_cobrado_split','amount_mxn', -v_intent.mp_fee,
              'booking_id', v_intent.booking_id, 'payment_id', v_pay,
              'note','Fee cobrado en el split de MP')
          ));
        end if;
      else
        perform ketzal.ledger_post(jsonb_build_array(
          jsonb_build_object('account_type','plataforma',
            'kind','cobro_por_cuenta','amount_mxn', -v_apply,
            'booking_id', v_intent.booking_id, 'payment_id', v_pay,
            'available_at', (now() + interval '7 days')::text,
            'note','Cobro MP por cuenta de la agencia (payout a 7 días)'),
          jsonb_build_object('account_type','agencia','account_supplier_id', v_intent.supplier_id,
            'kind','cobro_por_cuenta','amount_mxn', v_apply,
            'booking_id', v_intent.booking_id, 'payment_id', v_pay,
            'available_at', (now() + interval '7 days')::text,
            'note','Venta cobrada por Ketzal (payout a 7 días)')
        ));
      end if;
    exception when others then
      insert into ketzal.system_log(source, level, event, detail)
      values ('mp_confirm', 'warn', 'ledger_fallo',
        jsonb_build_object('intent', p_intent_id, 'payment_id', v_pay, 'motivo', SQLERRM));
    end;
  end if;

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
end $function$
;
