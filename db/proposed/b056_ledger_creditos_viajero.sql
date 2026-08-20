-- b056 — F3: el ledger balance-0 espeja los créditos del viajero.
-- Migración aplicada: `b056_ledger_creditos_viajero` (2026-08-19).
--
-- QUÉ CIERRA
-- Los créditos por cancelación ya existían (b049, `ketzal.credits`, saldo derivado
-- de `payments.credit_id`, universales por persona). Lo que faltaba era que el
-- ledger de doble partida (b052) los reflejara, para que el viajero tenga cuenta
-- propia en /cuentas y la deuda entre agencias por canje cruzado salga sola.
--
-- REGLA RESPETADA: la fuente es la tabla del dominio, el ledger la ESPEJA (mismo
-- criterio que `commission_lines`). NO se tocaron `cancel_booking_v2` ni
-- `redeem_credit`: sólo se les colgó un trigger. Tampoco hizo falta columna nueva
-- ni re-aplicar `ledger_post`: la trazabilidad ya es derivable
-- (canje → `payment_id` → `payments.credit_id`; emisión → `booking_id` →
-- `credits.booking_origen_id`). Menos superficie tocada en funciones de dinero.
--
-- ECONOMÍA DE LOS ASIENTOS
--   Emisión (cancelar en modo crédito): la agencia se quedó el efectivo y queda
--     debiendo valor redimible   ⇒ viajero +monto / agencia emisora −monto
--   Canje (`redeem_credit`): el viajero gasta ese valor en una venta
--                              ⇒ viajero −monto / agencia vendedora +monto
--   Si emisora ≠ vendedora, al netear queda emisora −X y vendedora +X: la deuda
--   inter-agencias por canje cruzado aparece DERIVADA, sin reporte aparte.
--
-- POR QUÉ NO HAY DOBLE CONTEO: `cancel_booking_v2` inserta el refund de emisión
-- con método 'credito' pero SIN `credit_id`; sólo `redeem_credit` lo pone. El
-- trigger de canje filtra por `credit_id is not null`, así que no ve la emisión.
-- (Verificado leyendo el DDL vivo de ambos RPCs antes de escribir esto.)
--
-- ALCANCE: el ledger sigue registrando OBLIGACIONES entre actores, no flujo bruto
-- de caja (igual que hoy con comisiones). Por eso no se asienta el efectivo
-- original de la venta ni la diferencia que retiene la agencia cuando el crédito
-- se emite a menos del 100%.
--
-- HUECO CONOCIDO: la cuenta del viajero se nombra con su perfil de plataforma
-- (`customers.marketplace_customer_id`). Un cliente dado de alta por un agente
-- puede no tenerlo: en ese caso NO se espeja (WARNING en el log de Postgres). El
-- crédito sigue válido y usable — sólo no aparece en /cuentas. Se cierra ligando
-- ese cliente a un perfil.
--
-- HARD-TEST EN VIVO (rollback garantizado vía RAISE en un DO block):
--   fixture: cliente con identidad, venta $1,000 pagada en Wanderlust, cancelada
--            en modo crédito; luego canje PARCIAL de $600 en una venta de Border.
--   emisión 2 asientos · canje 2 asientos
--   viajero = +400.00   (1000 emitido − 600 canjeado = saldo real del crédito)
--   Wanderlust (emisora)  = −1000.00
--   Border (vendedora)    =   +600.00   ⇒ deuda cruzada derivada, sin reporte extra
--   BALANCE GLOBAL = 0.00 ✓   settle_ledger('viajero') = bloqueado ✓
--   Rollback verificado: ledger, credits, customers, bookings y payments en 0;
--   `verificar_invariantes` 0; advisors sin ERROR.

-- 1. Dos kinds nuevos. Extensión aditiva del CHECK (calco de b054 con payee_type).
alter table ketzal.ledger_entries drop constraint ledger_entries_kind_check;
alter table ketzal.ledger_entries add constraint ledger_entries_kind_check
  check (kind = any (array['devengo','reverso','fee_cobrado_split','cobro_por_cuenta',
                           'payout','liquidacion','ajuste',
                           'credito_emitido','credito_canjeado']));

-- 2. Emisión: se dispara al nacer el crédito.
create or replace function ketzal.tg_ledger_mirror_credit_issue()
returns trigger
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare
  v_titular uuid;
begin
  if new.amount_mxn = 0 then return new; end if;

  select marketplace_customer_id into v_titular
    from ketzal.customers where id = new.customer_id;
  if v_titular is null then
    raise warning 'ledger: crédito % sin titular de plataforma; no se espeja', new.id;
    return new;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type','viajero', 'account_profile_id', v_titular,
      'kind','credito_emitido', 'amount_mxn', new.amount_mxn,
      'booking_id', new.booking_origen_id,
      'note','Crédito por cancelación'),
    jsonb_build_object(
      'account_type','agencia', 'account_supplier_id', new.supplier_id,
      'kind','credito_emitido', 'amount_mxn', -1 * new.amount_mxn,
      'booking_id', new.booking_origen_id,
      'note','Crédito emitido a viajero (a cargo)')
  ));
  return new;
end $$;

drop trigger if exists tg_ledger_credit_issue on ketzal.credits;
create trigger tg_ledger_credit_issue
  after insert on ketzal.credits
  for each row execute function ketzal.tg_ledger_mirror_credit_issue();

-- 3. Canje: se dispara con el abono método crédito que crea `redeem_credit`.
create or replace function ketzal.tg_ledger_mirror_credit_redeem()
returns trigger
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare
  v_titular uuid;
  v_vendedora uuid;
begin
  if new.amount_mxn = 0 then return new; end if;

  select c.marketplace_customer_id, b.selling_supplier_id
    into v_titular, v_vendedora
    from ketzal.bookings b
    left join ketzal.customers c on c.id = b.customer_id
   where b.id = new.booking_id;

  -- Sin titular o sin agencia vendedora (agente libre) no hay par que cuadre.
  if v_titular is null or v_vendedora is null then
    raise warning 'ledger: canje de crédito en pago % sin titular o sin agencia vendedora; no se espeja', new.id;
    return new;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type','viajero', 'account_profile_id', v_titular,
      'kind','credito_canjeado', 'amount_mxn', -1 * new.amount_mxn,
      'booking_id', new.booking_id, 'payment_id', new.id,
      'note','Crédito aplicado a una compra'),
    jsonb_build_object(
      'account_type','agencia', 'account_supplier_id', v_vendedora,
      'kind','credito_canjeado', 'amount_mxn', new.amount_mxn,
      'booking_id', new.booking_id, 'payment_id', new.id,
      'note','Crédito recibido como pago')
  ));
  return new;
end $$;

drop trigger if exists tg_ledger_credit_redeem on ketzal.payments;
create trigger tg_ledger_credit_redeem
  after insert on ketzal.payments
  for each row
  when (new.credit_id is not null and new.type = 'payment' and new.status = 'COMPLETED')
  execute function ketzal.tg_ledger_mirror_credit_redeem();

-- 4. LÍNEA ROJA: el crédito es REDIMIBLE en Ketzal, no RETIRABLE. Antes de b056 no
--    había saldos de viajero, así que liquidar uno era imposible en la práctica;
--    ahora que existen hay que cerrarlo explícitamente, o el superadmin podría
--    convertir un crédito en salida de efectivo desde /cuentas — justo el
--    territorio fintech/CNBV que se decidió no pisar (ver docs/FINANZAS_PLATAFORMA).
--    Re-aplicación aditiva desde el DDL vivo: sólo cambia esa lista.
--    (`ledger_summary` y `ledger_statement` NO se tocaron: ya contemplaban
--     'viajero' desde b052 y resuelven la self-view por `account_profile_id`.)
create or replace function ketzal.settle_ledger(
  p_account_type text,
  p_supplier uuid default null,
  p_profile uuid default null,
  p_amount numeric default null,
  p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'ketzal', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_saldo numeric;
  v_amount numeric(12,2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not ketzal.is_superadmin() then
    raise exception 'Solo el superadmin liquida cuentas.';
  end if;
  if p_account_type = 'viajero' then
    raise exception 'El crédito de un viajero es redimible en Ketzal, no retirable: no se liquida en efectivo. Si hay que devolver dinero, va por la devolución del pago original.';
  end if;
  if p_account_type not in ('agencia','embajador','agente') then
    raise exception 'Cuenta inválida.';
  end if;

  select coalesce(sum(amount_mxn), 0) into v_saldo
  from ketzal.ledger_entries
  where account_type = p_account_type
    and (account_supplier_id = p_supplier or account_supplier_id is null and p_supplier is null)
    and (account_profile_id = p_profile or account_profile_id is null and p_profile is null);

  v_amount := round(coalesce(p_amount, abs(v_saldo)), 2);
  if v_amount <= 0 then raise exception 'Nada que liquidar (saldo %).', v_saldo; end if;
  if v_amount > abs(v_saldo) + 0.005 then
    raise exception 'El monto (%) excede el saldo (%).', v_amount, v_saldo;
  end if;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object('account_type', p_account_type,
      'account_supplier_id', p_supplier, 'account_profile_id', p_profile,
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then -v_amount else v_amount end,
      'note', coalesce(p_note, 'Liquidación')),
    jsonb_build_object('account_type', 'plataforma',
      'kind', 'liquidacion', 'amount_mxn', case when v_saldo > 0 then v_amount else -v_amount end,
      'note', coalesce(p_note, 'Liquidación'))
  ));
  return jsonb_build_object('ok', true, 'liquidado', v_amount, 'saldo_previo', v_saldo);
end $$;

revoke all on function ketzal.settle_ledger(text, uuid, uuid, numeric, text) from public, anon;
grant execute on function ketzal.settle_ledger(text, uuid, uuid, numeric, text) to authenticated, service_role;

-- 5. Las funciones de trigger no son API (migración `b056_..._revoke`).
--    Los advisors las marcaron como "Public Can Execute SECURITY DEFINER
--    Function": quedaban publicadas en /rest/v1/rpc/<nombre>. Llamarlas por ahí
--    revienta igual (una función `returns trigger` sólo corre como trigger),
--    pero no hay razón para exponerlas.
--    Revocar EXECUTE NO apaga el trigger: Postgres verifica el permiso sobre la
--    función al CREAR el trigger, no cada vez que dispara. Re-testeado en vivo
--    después del revoke: 2 asientos de emisión, balance global 0.00,
--    `has_function_privilege('anon', …)` = false.
revoke all on function ketzal.tg_ledger_mirror_credit_issue() from public, anon, authenticated;
revoke all on function ketzal.tg_ledger_mirror_credit_redeem() from public, anon, authenticated;

-- PENDIENTE HEREDADO (no de b056): `tg_ledger_mirror_commission` (b052) tiene el
-- mismo advisor abierto. Mismo revoke de una línea cuando se toque ese carril.

-- APP (mismo carril): `/cuentas` gana las etiquetas de los dos kinds nuevos y
-- deja de ofrecer "Liquidar" en una cuenta de viajero (el RPC ya lo rechaza;
-- ofrecerlo sería prometer algo prohibido). `TIPO_LABEL` ya traía 'Viajero'.
