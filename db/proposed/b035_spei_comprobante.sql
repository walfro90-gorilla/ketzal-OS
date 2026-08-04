-- b035 — Comprobante obligatorio en pagos SPEI (b034).
-- Espejo de la migración aplicada `b035_spei_comprobante`.
--
-- Regla del fundador: cada transferencia declarada debe traer captura/imagen
-- del pago. La imagen sube directo del navegador al bucket público
-- `gorilla-assets` (misma infra que fotos de proveedor; carpeta spei/{booking});
-- la URL se guarda en payment_intents.receipt_url y el admin la ve en /cobranza
-- antes de confirmar. La app valida que la URL sea del propio Storage
-- (esBannerValido, anti-SSRF); el RPC exige no-vacía y acota longitud.
--
-- Nota: bucket público con path no adivinable (uuid + aleatorio) — mismo modelo
-- de seguridad que /recibo/[uuid]. Si algún día se quiere bucket privado con
-- signed URLs, solo cambia la capa de subida/lectura, no este contrato.

alter table ketzal.payment_intents add column if not exists receipt_url text;

-- submit_spei_payment ahora exige comprobante (4º parámetro). Se elimina la
-- firma anterior de 3 args para evitar ambigüedad en PostgREST.
drop function if exists ketzal.submit_spei_payment(uuid, numeric, text);

create or replace function ketzal.submit_spei_payment(
  p_booking_id uuid, p_amount numeric, p_reference text default null, p_receipt_url text default null
) returns jsonb
 language plpgsql security definer set search_path to 'ketzal','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid; v_mc uuid; v_bstatus ketzal.booking_status;
  v_balance numeric; v_amount numeric(12,2);
  v_ref text; v_receipt text; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  -- Comprobante obligatorio (b035): sin captura del pago no se declara.
  v_receipt := nullif(left(btrim(coalesce(p_receipt_url,'')), 500), '');
  if v_receipt is null then
    raise exception 'Adjunta el comprobante de tu transferencia.';
  end if;

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
      set amount = v_amount, mp_payment_id = v_ref, receipt_url = v_receipt, updated_at = now()
      where id = v_id;
  else
    insert into ketzal.payment_intents(booking_id, supplier_id, created_by, marketplace_customer_id,
                                       amount, provider, mp_payment_id, receipt_url, status)
    values (p_booking_id, v_supplier, null, v_uid, v_amount, 'spei', v_ref, v_receipt, 'pending')
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $function$;

revoke all on function ketzal.submit_spei_payment(uuid, numeric, text, text) from public, anon;
grant execute on function ketzal.submit_spei_payment(uuid, numeric, text, text) to authenticated, service_role;

-- list_pending_spei: + receipt_url (el admin revisa el comprobante antes de confirmar).
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
      select pi.id, pi.booking_id, pi.amount, pi.mp_payment_id as reference,
             pi.receipt_url, pi.created_at,
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
