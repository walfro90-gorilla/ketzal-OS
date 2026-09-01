-- b081 — Un solo riel para pagarle a una persona: el gasto. El ledger lo espeja.
-- Espejo de las migraciones `b081_un_solo_riel_de_pago_a_personas` y
-- `b081b_pagado_incluye_categoria_agente`.
--
-- ── El problema ────────────────────────────────────────────────────────────
--
-- Había DOS formas de saldarle la comisión a un embajador, y no se veían entre sí:
--
--   · registrar el gasto en /gastos (`expenses` category='embajador') — baja la
--     CxP y el "pagado" de su portal, pero deja su saldo VIVO en el ledger;
--   · `settle_ledger` desde /cuentas — cierra el ledger, pero la CxP y el portal
--     siguen mostrando saldo por cobrar.
--
-- Cualquiera de las dos deja una pantalla mintiendo. Y un corte quincenal que
-- lea una fuente mientras alguien liquidó por la otra PAGA DOS VECES.
--
-- ── La decisión: no es nueva, es aplicar ADR-0011 ──────────────────────────
--
-- ADR-0011 ya dice: «el ledger ESPEJA, no recrea: triggers sobre los hechos
-- generan los asientos. No se insertan asientos "a mano" que re-cuenten un
-- hecho ya contado (doble contabilidad)».
--
-- `settle_ledger` sobre un embajador era exactamente eso: un asiento puesto a
-- mano que re-cuenta un pago que YA vive en `expenses`. Era la excepción que
-- rompía su propia regla, y la puerta por la que se podía pagar dos veces.
--
--   1. El HECHO es el gasto. Pagar = registrarlo en /gastos.
--   2. `tg_ledger_mirror_expense` postea la liquidación al ledger solo, gemelo
--      exacto de `tg_ledger_mirror_commission`: el devengo puso +persona/−agencia,
--      el pago pone lo contrario y el grupo cierra en 0.
--   3. `settle_ledger` rechaza 'embajador' y 'agente' —con un mensaje que dice a
--      dónde ir—, igual que ya rechazaba 'viajero'.
--
-- `agencia` NO entra: su saldo en el ledger es el corte de plataforma
-- (Ketzal↔agencia) y `expenses` category='mayorista' es pagarle a un proveedor.
-- Son deudas distintas, no hay choque, y `settle_ledger` sigue siendo su camino.
--
-- ── Categoría 'agente' (b081b) ─────────────────────────────────────────────
--
-- `expenses` no tenía categoría para pagarle a un agente. Desde m010 el portal
-- de embajador también lo usan los AGENTES con código de referido, y su
-- "pagado" salía solo de category='embajador' ⇒ a un agente pagado por
-- `settle_ledger` su portal le decía **"pagado $0" para siempre**, aunque ya
-- hubiera cobrado. Se abre la categoría y los dos resúmenes la leen.

-- 1) Categoría propia para pagarle a un AGENTE su comisión de referido.
alter table ketzal.expenses drop constraint if exists expenses_category_check;
alter table ketzal.expenses add constraint expenses_category_check check (
  category = any (array['operacion','transporte','hospedaje','alimentos',
                        'mayorista','embajador','agente','marketing','otro'])
);
alter table ketzal.expenses drop constraint if exists expenses_provider_chk;
alter table ketzal.expenses add constraint expenses_provider_chk check (
  (category <> all (array['mayorista','embajador','agente']))
  or (category = 'mayorista' and provider_supplier_id is not null)
  or (category in ('embajador','agente') and provider_profile_id is not null)
);

-- 2) El gasto ESPEJA su liquidación al ledger (ADR-0011).
create or replace function ketzal.tg_ledger_mirror_expense()
  returns trigger
  language plpgsql security definer set search_path to 'ketzal', 'pg_temp'
as $function$
declare v_signo numeric;
begin
  if new.category not in ('embajador','agente') then return new; end if;
  if new.provider_profile_id is null or new.supplier_id is null or new.amount_mxn = 0 then
    return new;
  end if;

  -- 'egreso' baja lo que se le debe a la persona; 'reverso' lo devuelve.
  v_signo := case when new.kind = 'reverso' then 1 else -1 end;

  perform ketzal.ledger_post(jsonb_build_array(
    jsonb_build_object(
      'account_type', new.category,
      'account_profile_id', new.provider_profile_id,
      'kind', 'liquidacion',
      'amount_mxn', v_signo * new.amount_mxn,
      'note', 'Pago de comisión ' || new.category),
    jsonb_build_object(
      'account_type', 'agencia',
      'account_supplier_id', new.supplier_id,
      'kind', 'liquidacion',
      'amount_mxn', -v_signo * new.amount_mxn,
      'note', 'Pago de comisión ' || new.category || ' (a cargo)')
  ));
  return new;
end $function$;

drop trigger if exists ledger_mirror_expense on ketzal.expenses;
create trigger ledger_mirror_expense
  after insert on ketzal.expenses
  for each row execute function ketzal.tg_ledger_mirror_expense();

-- 3) settle_ledger deja de aceptar las cuentas que YA tienen riel de gasto.
--    (Cuerpo completo re-aplicado desde el DDL vivo; solo cambian los guards.)
--    Ver la migración aplicada: rechaza 'viajero' (como antes), rechaza
--    'embajador' y 'agente' señalando /gastos, y solo acepta 'agencia'.

-- 4) b081b — los dos resúmenes leen también la categoría 'agente':
--    `ambassador_payables_summary` y `my_ambassador_earnings` pasan de
--    `category = 'embajador'` a `category in ('embajador','agente')`.
