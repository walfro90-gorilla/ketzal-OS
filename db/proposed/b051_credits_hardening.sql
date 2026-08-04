-- b051 — Blindaje del subsistema de crédito + cierre de un hueco PRE-EXISTENTE
-- del ledger. Espejo de la migración aplicada `ketzal_credits_hardening`.
--
-- ORIGEN: security review del PR #67 (el workflow `security-review.yml` falla
-- por falta del secret ANTHROPIC_API_KEY en el repo ⇒ la revisión se corrió a
-- mano con el mismo prompt). 3 hallazgos, los 3 CONFIRMADOS contra la BD viva
-- y los 3 reproducidos como exploit antes y después del fix.
--
-- ── H2 (el más grave; PRE-EXISTENTE, no lo introdujo el PR) ────────────────
-- `authenticated` tenía GRANT UPDATE de TABLA COMPLETA sobre ketzal.payments
-- (policy `payments_scoped_upd`: user_id = auth.uid() OR supplier_id =
-- my_supplier_id()) y el trigger `no_mutar` solo cubre DELETE/TRUNCATE ⇒ por
-- PostgREST con la anon key, un autenticado podía PATCH sus propios asientos:
--   · subir `amount_mxn` ⇒ marcar una venta como pagada sin dinero real;
--   · poner `credit_id = null` ⇒ el saldo del crédito es DERIVADO de esa
--     columna, así que el mismo crédito se gastaba infinitas veces.
-- El comprador B2C también llegaba (sus pagos MP llevan user_id = su uid).
-- Verificado antes de revocar: NINGUNA función del schema y NINGUNA línea de
-- la app hacen UPDATE sobre payments (todo el dinero entra por RPCs que
-- INSERTAN) ⇒ revocar no rompe nada. Se dropea además la policy para que un
-- re-grant futuro caiga en deny-by-default. service_role conserva su acceso.
--
-- ── H3: crédito acuñable ───────────────────────────────────────────────────
-- `credits` tenía policy de INSERT (necesaria porque cancel_booking_v2 era
-- INVOKER) ⇒ POST /rest/v1/credits directo acuñaba crédito arbitrario
-- (monto/vigencia/cliente a gusto). Ahora la tabla es RPC-only-write, como
-- sales_goals / agency_invitations, y cancel_booking_v2 pasa a DEFINER con
-- guard de dueño explícito. Segundo vector: `credito.pct` sale de
-- suppliers.info (editable por la propia agencia) y no tenía tope ⇒ pct=10000
-- convertía $100 pagados en $10,000 de crédito. Ahora el crédito está acotado
-- por `least(v_pagado, ...)` y los pct se sanean en la fuente.
--
-- ── H1: canje sin legitimación del lado del crédito ────────────────────────
-- redeem_credit solo validaba el lado de la VENTA destino + "misma persona",
-- y la agencia destino controla ambos (crea la venta y la ficha de cliente con
-- el marketplace_customer_id del viajero) ⇒ la agencia B podía consumir sola
-- el crédito que A le emitió a una persona y volverlo pena retenida
-- cancelando dentro de 48h, generando además una deuda A→B. Ahora el canje
-- exige: superadmin ∨ agencia EMISORA ∨ el propio TITULAR.
-- El crédito sigue siendo UNIVERSAL (decisión del fundador): el viajero lo
-- aplica él mismo desde /mis-compras a su pedido en cualquier agencia.
-- Follow-up para el mostrador cross-agencia: código de canje de un solo uso.
-- list_customer_credits se acota a lo que MI agencia emitió (antes exponía a
-- cualquier agencia el saldo que otra le había emitido a esa persona).
--
-- Hard-test en vivo (fixtures QA e0510000-*, limpiadas; invariantes 0,
-- advisors 0 ERROR): exploit H1 con id de crédito conocido ⇒ bloqueado;
-- titular canjeando cross-agencia ⇒ FUNCIONA (universal vivo, saldo derivado
-- 4000→2500); UPDATE de payments (credit_id y amount_mxn) ⇒ permission
-- denied; INSERT directo en credits ⇒ permission denied; pct=10000 con $100
-- pagados ⇒ crédito $100; vigencia 999 meses ⇒ 120; cancelar venta ajena con
-- el RPC ya DEFINER ⇒ bloqueado; agencia B no ve el crédito de A.

-- 1) H2 — payments deja de ser escribible por el cliente ────────────────────
drop policy if exists payments_scoped_upd on ketzal.payments;
revoke update on ketzal.payments from authenticated, anon;

-- 2) H3 — credits: escritura solo vía RPC ───────────────────────────────────
drop policy if exists credits_ins on ketzal.credits;
revoke insert on ketzal.credits from authenticated, anon;

-- 3) Saneo de la política en la fuente única de resolución ──────────────────
--    (pct clampeados 0..100, vigencia 1..120 meses; tramos ordenados).
create or replace function ketzal.effective_cancellation_policy(p_supplier uuid)
returns jsonb
language sql stable security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  with raw as (
    select coalesce(
      (select s.info->'cancellation_policy' from ketzal.suppliers s where s.id = p_supplier),
      (select a.cancellation_policy from ketzal.app_settings a where a.id = 1)
    ) as pol
  )
  select case when raw.pol is null then null else
    raw.pol || jsonb_build_object(
      'tramos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'dias_min', greatest(0, (t->>'dias_min')::int),
                 'retencion_pct', least(100, greatest(0, (t->>'retencion_pct')::numeric)))
               order by greatest(0, (t->>'dias_min')::int) desc)
        from jsonb_array_elements(
               case when jsonb_typeof(raw.pol->'tramos') = 'array'
                    then raw.pol->'tramos' else '[]'::jsonb end) t
        where t ? 'dias_min' and t ? 'retencion_pct'
      ), '[]'::jsonb),
      'no_show_pct', least(100, greatest(0, coalesce((raw.pol->>'no_show_pct')::numeric, 100))),
      'credito', jsonb_build_object(
        'pct', least(100, greatest(0, coalesce((raw.pol->'credito'->>'pct')::numeric, 100))),
        'vigencia_meses', least(120, greatest(1, coalesce((raw.pol->'credito'->>'vigencia_meses')::int, 12))))
    )
  end
  from raw;
$$;

revoke all on function ketzal.effective_cancellation_policy(uuid) from public, anon;
grant execute on function ketzal.effective_cancellation_policy(uuid) to authenticated, service_role;

-- 4) preview_cancellation: clamp del tramo y del crédito leídos del snapshot
--    (bookings_upd no restringe columnas ⇒ el snapshot es manipulable por la
--    propia agencia; la pena queda 0..total y el crédito ≤ pagado).
--    Cuerpo completo en la migración aplicada; cambios vs b047:
--      v_tramo_pct := least(100, greatest(0, coalesce(...)));
--      v_pena      := least(total, greatest(round(total*pct/100,2), greatest(v_eng,0)));
--      credito.monto_mxn := least(v_pagado, round(v_pagado * clamp(pct) / 100, 2));
--      vigencia := least(120, greatest(1, ...));

-- 5) H3 — cancel_booking_v2 DEFINER + guard de dueño + crédito acotado ──────
--    Guard (calco b047, coalesce obligatorio contra el OR trivalente):
--      is_superadmin() ∨ sold_by = uid ∨ selling_supplier_id = my_supplier_id()
--    OJO: el comprador B2C NO entra — cancelar es acto de la agencia vendedora.
--    Monto del crédito: least(v_pagado, round(v_pagado * clamp(pct) / 100, 2)).

-- 6) H1 — redeem_credit exige legitimación del lado del CRÉDITO ─────────────
--      is_superadmin() ∨ credits.supplier_id = my_supplier_id()
--                      ∨ customers.marketplace_customer_id (del crédito) = uid
--    …ADEMÁS del guard de la venta destino y del match de persona ya existentes.

-- 7) H1-bis — list_customer_credits: solo créditos emitidos por MI agencia ──
--      and (ketzal.is_superadmin() or c.supplier_id = ketzal.my_supplier_id())

-- Los cuerpos completos de (4)(5)(6)(7) viven en la migración aplicada
-- `ketzal_credits_hardening`; aquí se documentan los deltas para no duplicar
-- 300 líneas que ya están en b047/b049/b050 (mismo criterio que b049 §6).
