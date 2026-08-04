-- b049 — Crédito (saldo a favor) como objeto de primera clase (C5 del plan de
-- cancelaciones). Espejo de las migraciones aplicadas `ketzal_credits_v1` +
-- `ketzal_credits_universal` (consolidadas).
--
-- Diseño:
--  · Emisión al cancelar con modo crédito (cancel_booking_v2, b050): asiento
--    refund método 'credito' en la venta origen + fila aquí. SALDO SIEMPRE
--    DERIVADO (regla de oro #2): amount_mxn − Σ(canjes COMPLETED con
--    credit_id). Sin campo mutable, sin update/delete (revocados).
--  · **CRÉDITO UNIVERSAL** (decisión del fundador 2026-08-04): se canjea en
--    CUALQUIER servicio de Ketzal. El match es por PERSONA: mismo customer o
--    customers ligados al mismo marketplace_customer_id (cross-agencia).
--  · Contabilidad inter-agencias DERIVABLE, no un campo: canje con credit_id
--    cuyo credits.supplier_id ≠ venta.selling_supplier_id ⇒ la agencia
--    emisora (que retuvo el efectivo) le debe ese monto a la vendedora.
--    Reporte = follow-up; el dato ya vive en el ledger.
--  · Expiración LAZY: el guard del canje checa expires_at; sin cron.
--  · redeem_credit es SECURITY DEFINER: la RLS de credits es por agencia
--    emisora y bloquearía el canje cross-agencia. Guards explícitos: caller
--    activo + dueño de la VENTA destino (calco b047 con coalesce) + persona.
--  · Candado anti-fuga: un abono método 'credito' NO se devuelve en efectivo
--    (sería canjear el crédito por cash). refund_payment se re-aplicó ADITIVO
--    desde el DDL vivo (+1 guard); refund_payment_partial (b048, este carril)
--    ganó el mismo guard. register_payment (refund manual) queda sin el
--    candado a propósito (criterio del admin).
--
-- Hard-test en vivo (fixtures QA e0500000-*, limpiadas, invariantes 0,
-- advisors 0 ERROR): canje parcial ×2 con saldo derivado, venta liquidada con
-- crédito ⇒ paid, canje CROSS-AGENCIA misma persona ✓ (asiento en la
-- vendedora, emisor distinto = deuda derivable), cross-persona bloqueado,
-- expirado bloqueado, sobre-saldo (crédito y venta) bloqueado, refund en
-- efectivo de un canje bloqueado (total y parcial), viajero ve su crédito
-- (list_my_credits) con saldo derivado.

-- 1) Tabla ───────────────────────────────────────────────────────────────────
create table if not exists ketzal.credits (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references ketzal.suppliers(id),   -- agencia EMISORA
  customer_id uuid not null references ketzal.customers(id),
  booking_origen_id uuid not null references ketzal.bookings(id),
  amount_mxn numeric(12,2) not null check (amount_mxn > 0),
  expires_at date not null,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table ketzal.credits enable row level security;

create policy credits_sel on ketzal.credits for select to authenticated
  using (ketzal.is_superadmin() or supplier_id = ketzal.my_supplier_id());
create policy credits_ins on ketzal.credits for insert to authenticated
  with check (ketzal.is_active()
    and (ketzal.is_superadmin() or supplier_id = ketzal.my_supplier_id()));

revoke update, delete, truncate on ketzal.credits from authenticated, anon, public;

-- 2) El canje se liga al crédito ─────────────────────────────────────────────
alter table ketzal.payments add column if not exists credit_id uuid references ketzal.credits(id);

-- 3) Canje (DEFINER; universal por persona) ──────────────────────────────────
create or replace function ketzal.redeem_credit(p_credit uuid, p_booking uuid, p_amount numeric)
returns numeric
language plpgsql security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_c ketzal.credits;
  v_b ketzal.bookings;
  v_persona_credito uuid;
  v_persona_venta uuid;
  v_canjeado numeric; v_saldo_credito numeric; v_pagado numeric; v_saldo_venta numeric; v_balance numeric;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_active() then raise exception 'Tu cuenta está pendiente de aprobación.'; end if;
  if v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;

  select * into v_c from ketzal.credits where id = p_credit;
  if not found then raise exception 'Crédito no encontrado'; end if;
  if current_date >= v_c.expires_at then
    raise exception 'El crédito expiró el %.', v_c.expires_at; end if;

  select * into v_b from ketzal.bookings where id = p_booking for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_b.sold_by = v_uid, false)
          or coalesce(v_b.selling_supplier_id = ketzal.my_supplier_id(), false)
          or coalesce(v_b.marketplace_customer_id = v_uid, false)) then
    raise exception 'Sin acceso a esta venta';
  end if;
  if v_b.status = 'cancelled' then raise exception 'La venta está cancelada.'; end if;

  if v_b.customer_id is distinct from v_c.customer_id then
    select marketplace_customer_id into v_persona_credito from ketzal.customers where id = v_c.customer_id;
    select marketplace_customer_id into v_persona_venta from ketzal.customers where id = v_b.customer_id;
    if v_persona_credito is null or v_persona_venta is null
       or v_persona_credito is distinct from v_persona_venta then
      raise exception 'El crédito es de otro cliente.';
    end if;
  end if;

  -- Dos canjes simultáneos del mismo crédito en ventas distintas: serializa.
  perform pg_advisory_xact_lock(hashtextextended(p_credit::text, 42));
  select coalesce(sum(amount_mxn), 0) into v_canjeado
    from ketzal.payments where credit_id = p_credit and status = 'COMPLETED';
  v_saldo_credito := round(v_c.amount_mxn - v_canjeado, 2);
  if v_monto > v_saldo_credito then
    raise exception 'El monto (%) excede el saldo del crédito (%).', v_monto, v_saldo_credito;
  end if;

  select coalesce(sum(case when type = 'payment' then amount_mxn
                           when type = 'refund' then -amount_mxn else 0 end), 0)
    into v_pagado
    from ketzal.payments where booking_id = p_booking and status = 'COMPLETED';
  v_saldo_venta := round(v_b.total - v_pagado, 2);
  if v_monto > v_saldo_venta then
    raise exception 'El monto (%) excede el saldo de la venta (%).', v_monto, v_saldo_venta;
  end if;

  insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
                              payment_method, paid_at, installments, current_installment, credit_id)
  values (p_booking, v_b.selling_supplier_id, v_uid, v_monto, 'COMPLETED', 'payment',
          'credito', now(), 1, 1, p_credit);

  select balance into v_balance from ketzal.bookings_with_balance where id = p_booking;
  update ketzal.bookings
     set status = case when v_balance <= 0 then 'paid'::ketzal.booking_status else status end
   where id = p_booking and status <> 'cancelled';

  return round(v_saldo_credito - v_monto, 2);
end $$;

revoke all on function ketzal.redeem_credit(uuid, uuid, numeric) from public, anon;
grant execute on function ketzal.redeem_credit(uuid, uuid, numeric) to authenticated, service_role;

-- 4) Créditos del viajero (DEFINER scoped a auth.uid vía customers) ──────────
create or replace function ketzal.list_my_credits()
returns jsonb
language sql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'agencia', s.name,
    'monto_mxn', c.amount_mxn,
    'saldo_mxn', round(c.amount_mxn - coalesce((
       select sum(p.amount_mxn) from ketzal.payments p
        where p.credit_id = c.id and p.status = 'COMPLETED'), 0), 2),
    'expira', c.expires_at,
    'vigente', current_date < c.expires_at
  ) order by c.expires_at), '[]'::jsonb)
  from ketzal.credits c
  join ketzal.customers cu on cu.id = c.customer_id
  join ketzal.suppliers s on s.id = c.supplier_id
  where cu.marketplace_customer_id = auth.uid();
$$;

revoke all on function ketzal.list_my_credits() from public, anon;
grant execute on function ketzal.list_my_credits() to authenticated, service_role;

-- 5) Créditos de la persona detrás de un customer (UI del agente) ────────────
create or replace function ketzal.list_customer_credits(p_customer uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_cu ketzal.customers;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_cu from ketzal.customers where id = p_customer;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not (ketzal.is_superadmin()
          or coalesce(v_cu.supplier_id = ketzal.my_supplier_id(), false)) then
    raise exception 'Sin acceso a este cliente';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'agencia', s.name,
      'monto_mxn', c.amount_mxn,
      'saldo_mxn', round(c.amount_mxn - coalesce((
         select sum(p.amount_mxn) from ketzal.payments p
          where p.credit_id = c.id and p.status = 'COMPLETED'), 0), 2),
      'expira', c.expires_at
    ) order by c.expires_at), '[]'::jsonb)
    from ketzal.credits c
    join ketzal.suppliers s on s.id = c.supplier_id
    join ketzal.customers cu on cu.id = c.customer_id
    where current_date < c.expires_at
      and (c.customer_id = p_customer
           or (v_cu.marketplace_customer_id is not null
               and cu.marketplace_customer_id = v_cu.marketplace_customer_id))
  );
end $$;

revoke all on function ketzal.list_customer_credits(uuid) from public, anon;
grant execute on function ketzal.list_customer_credits(uuid) to authenticated, service_role;

-- 6) Candado: los canjes de crédito NO se devuelven en efectivo ──────────────
-- refund_payment: re-apply ADITIVO desde el DDL vivo, +1 guard (línea
-- payment_method='credito'). refund_payment_partial (b048): mismo guard.
-- Ver la migración aplicada `ketzal_credits_v1` para los cuerpos completos —
-- idénticos a los vigentes salvo el guard:
--   if v_pay.payment_method = 'credito' then
--     raise exception 'Un abono pagado con crédito no se devuelve en efectivo.';
--   end if;
