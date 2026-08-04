-- b037 — Transferencias SPEI rechazadas: visibles y reabribles.
-- Espejo de la migración aplicada `b037_spei_reopen`.
--
-- Problema: rechazar dejaba el intent en 'rejected' (fila + comprobante quedan
-- para siempre — nada se pierde) pero SIN UI: un rechazo por error de una
-- transferencia que SÍ llegó no tenía camino visible de corrección (solo el
-- abono manual en la venta, o que el comprador re-declare). Ahora /cobranza
-- lista las rechazadas recientes y el admin puede REABRIR una (vuelve a
-- 'pending' y se confirma por el camino normal de dinero).
--
--  · list_rejected_spei(days=14): mismas reglas de visibilidad que
--    list_pending_spei (admin de la agencia / superadmin ve todo).
--  · reopen_spei_payment(intent): guard is_agency_admin/superadmin; solo
--    'rejected'; bloquea si la venta está cancelada o si ya hay OTRO intent
--    spei pendiente de la misma venta (el dedupe de submit garantiza 1).

create or replace function ketzal.list_rejected_spei(p_days int default 14)
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
    select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
    from (
      select pi.id, pi.booking_id, pi.amount, pi.mp_payment_id as reference,
             pi.receipt_url, pi.created_at, pi.updated_at,
             coalesce(c.full_name, 'Comprador') as cliente,
             coalesce(sv.name, 'Viaje') as servicio,
             b.status::text as booking_status,
             bwb.balance
      from ketzal.payment_intents pi
      join ketzal.bookings b on b.id = pi.booking_id
      join ketzal.bookings_with_balance bwb on bwb.id = b.id
      left join ketzal.customers c on c.id = b.customer_id
      left join ketzal.services sv on sv.id = b.service_id
      where pi.provider = 'spei' and pi.status = 'rejected'
        and pi.updated_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
        and (v_super or pi.supplier_id = v_supplier)
    ) x
  );
end $function$;

revoke all on function ketzal.list_rejected_spei(int) from public, anon;
grant execute on function ketzal.list_rejected_spei(int) to authenticated, service_role;

create or replace function ketzal.reopen_spei_payment(p_intent_id uuid)
 returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_intent ketzal.payment_intents;
  v_bstatus ketzal.booking_status;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select * into v_intent from ketzal.payment_intents where id = p_intent_id for update;
  if not found or v_intent.provider <> 'spei' or v_intent.status <> 'rejected' then
    raise exception 'Transferencia no encontrada o no está rechazada.';
  end if;

  if not ketzal.is_superadmin() and not ketzal.is_agency_admin(v_intent.supplier_id) then
    raise exception 'Solo el admin de la agencia puede reabrir esta transferencia.';
  end if;

  select status into v_bstatus from ketzal.bookings where id = v_intent.booking_id;
  if v_bstatus = 'cancelled' then
    raise exception 'La venta está cancelada; registra el dinero como abono manual si aplica.';
  end if;

  -- El comprador pudo re-declarar mientras tanto: conservar 1 pendiente por venta.
  if exists (
    select 1 from ketzal.payment_intents
    where booking_id = v_intent.booking_id and provider = 'spei' and status = 'pending'
  ) then
    raise exception 'Esa venta ya tiene otra transferencia pendiente; resuélvela primero.';
  end if;

  update ketzal.payment_intents set status = 'pending', updated_at = now()
    where id = p_intent_id;

  return jsonb_build_object('ok', true);
end $function$;

revoke all on function ketzal.reopen_spei_payment(uuid) from public, anon;
grant execute on function ketzal.reopen_spei_payment(uuid) to authenticated, service_role;
