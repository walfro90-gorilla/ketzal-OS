-- 015 — F7: Clawbot 3 reglas nuevas (saldo_sin_plan, viaje_manana_operativo,
--        pago_sin_recibo).
--
-- COORDINACIÓN (no romper al otro agente): NO se re-escribe el motor
-- `clawbot_generar_recordatorios` (las 4 reglas existentes quedan intactas) ni
-- `clawbot_resumen`/`clawbot_bandeja`. Solo:
--   (1) se extiende el CHECK de `kind` (4 → 7),
--   (2) se agrega una función NUEVA e independiente con las 3 reglas,
--   (3) el cron la llama además del motor existente.
-- `clawbot_reminders.channel` ya existe (default 'whatsapp'); las reglas
-- internas usan channel='interno'.
--
-- Espejo del DDL vivo; la fuente es la BD (apply_migration).

-- (1) CHECK de kind: 4 existentes + 3 nuevos (idéntico a lo vivo, aditivo).
alter table ketzal.clawbot_reminders drop constraint if exists clawbot_reminders_kind_check;
alter table ketzal.clawbot_reminders add constraint clawbot_reminders_kind_check check (
  kind = any (array[
    'abono_por_vencer','abono_vencido','cotizacion_seguimiento','viaje_proximo',
    'saldo_sin_plan','viaje_manana_operativo','pago_sin_recibo'
  ])
);

-- (2) Reglas operativas nuevas (independiente del motor; idempotente por dedupe).
create or replace function ketzal.clawbot_reglas_operativas() returns integer
  language plpgsql security definer
  set search_path to 'ketzal', 'public'
as $$
declare v_new integer;
begin
  -- A) saldo_sin_plan: venta de CONTADO con saldo, ≥3 días (hoy solo se persigue
  --    a quien tiene plan de abonos). Nudge al cliente (whatsapp). Dedupe semanal.
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'saldo_sin_plan', 'whatsapp', 'Saldo por cobrar',
    format('Hola %s, tu viaje "%s" con %s tiene un saldo de $%s. ¿Te ayudamos a agendar tu pago? Gracias!',
      coalesce(c.full_name,'cliente'), coalesce(sv.name,'tu viaje'), coalesce(s.name,'Ketzal'),
      to_char(bwb.balance,'FM999,999,990.00')),
    c.phone, 'saldo_sin_plan:'||b.id||':'||to_char(current_date,'IYYY-IW')
  from ketzal.bookings b
  join ketzal.bookings_with_balance bwb on bwb.id = b.id
  left join ketzal.customers c  on c.id  = b.customer_id
  left join ketzal.services  sv on sv.id = b.service_id
  left join ketzal.suppliers  s on s.id  = b.selling_supplier_id
  where b.status in ('reserved','confirmed')
    and b.payment_type = 'contado'
    and bwb.balance > 0
    and b.created_at::date <= current_date - 3
  on conflict (dedupe_key) do nothing;

  -- B) viaje_manana_operativo: viaje mañana, INTERNO al agente (pax capturados
  --    X/Y). Depende de F3 (booking_passengers). channel='interno', sin teléfono.
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'viaje_manana_operativo', 'interno', 'Viaje mañana',
    format('Mañana %s sale "%s" (%s pax). Pasajeros capturados: %s/%s — revisa el manifiesto.',
      to_char(b.travel_date,'DD/MM'), coalesce(sv.name,'el viaje'), b.num_pax,
      (select count(*) from ketzal.booking_passengers bp where bp.booking_id = b.id), b.num_pax),
    null, 'viaje_manana_operativo:'||b.id||':'||b.travel_date
  from ketzal.bookings b
  left join ketzal.services sv on sv.id = b.service_id
  where b.status in ('reserved','confirmed','paid')
    and b.travel_date = current_date + 1
  on conflict (dedupe_key) do nothing;

  -- C) pago_sin_recibo: abono COMPLETED sin recibo tras 24h (higiene). INTERNO.
  insert into ketzal.clawbot_reminders(booking_id, customer_id, supplier_id, sold_by, kind, channel, title, message, phone, dedupe_key)
  select b.id, b.customer_id, b.selling_supplier_id, b.sold_by, 'pago_sin_recibo', 'interno', 'Abono sin recibo',
    format('El abono de $%s de la venta %s (%s) no tiene recibo emitido — emítelo para el cliente.',
      to_char(p.amount_mxn,'FM999,999,990.00'),
      coalesce(b.folio,'#'||left(b.id::text,8)), coalesce(c.full_name,'cliente')),
    null, 'pago_sin_recibo:'||p.id
  from ketzal.payments p
  join ketzal.bookings b on b.id = p.booking_id
  left join ketzal.customers c on c.id = b.customer_id
  where p.type = 'payment' and p.status = 'COMPLETED'
    and coalesce(p.paid_at, p.created_at) <= now() - interval '24 hours'
    and b.status <> 'cancelled'
    and not exists (select 1 from ketzal.receipts r where r.payment_id = p.id)
  on conflict (dedupe_key) do nothing;

  select count(*) into v_new from ketzal.clawbot_reminders where status = 'pendiente';
  return v_new;
end $$;
revoke all on function ketzal.clawbot_reglas_operativas() from public, anon;
grant execute on function ketzal.clawbot_reglas_operativas() to authenticated, service_role;
