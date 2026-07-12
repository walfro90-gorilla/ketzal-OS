-- Tests de invariantes de dinero (P0 del FODA 2026-07-11).
-- Corre sin framework: `psql "$DATABASE_URL" -f supabase/tests/money_invariants.sql`
-- o pégalo en el SQL editor de Supabase. Éxito = un NOTICE final; cualquier
-- invariante rota lanza EXCEPTION y aborta.
--
-- Cubre la función PURA del plan de pagos (`_compute_payment_plan`): la regla de
-- oro "Σ abonos = total exacto" + enganche + fail-closed en entradas inválidas.
-- Es read-only (IMMUTABLE, sin escrituras) → seguro correrlo contra cualquier BD.
-- Siguiente incremento (rutas con escritura: folio atómico, register_payment,
-- comisiones) requiere un harness transaccional aparte.

do $$
declare
  c jsonb; r jsonb; s numeric; ok boolean;
begin
  -- Matriz de casos: totales "feos" a propósito para forzar absorción de centavos.
  for c in select * from jsonb_array_elements('[
    {"total":10000,   "days":90,  "freq":"mensual",  "pct":0.20},
    {"total":9999.99, "days":100, "freq":"semanal",  "pct":0.50},
    {"total":1,       "days":30,  "freq":"quincenal","pct":0.00},
    {"total":7777.77, "days":365, "freq":"mensual",  "pct":0.33},
    {"total":100,     "days":7,   "freq":"semanal",  "pct":0.99}
  ]'::jsonb)
  loop
    r := ketzal._compute_payment_plan(
           (c->>'total')::numeric, current_date,
           current_date + (c->>'days')::int, c->>'freq', (c->>'pct')::numeric);

    -- Invariante #1 (la de oro): Σ montos de items = total, exacto.
    select sum((it->>'amount')::numeric) into s
      from jsonb_array_elements(r->'items') it;
    if s is distinct from (c->>'total')::numeric then
      raise exception 'Σ items % <> total % (caso %)', s, c->>'total', c;
    end if;

    -- Invariante #2: enganche = round(total * pct, 2).
    if (r->>'enganche')::numeric
       is distinct from round((c->>'total')::numeric * (c->>'pct')::numeric, 2) then
      raise exception 'enganche incorrecto (caso %)', c;
    end if;

    -- Invariante #3: hay exactamente num_abonos + 1 items (el +1 es el enganche).
    if jsonb_array_length(r->'items') <> (r->>'num_abonos')::int + 1 then
      raise exception 'conteo de items inconsistente (caso %)', c;
    end if;

    -- Invariante #4: ningún monto negativo (una absorción mal hecha lo delataría).
    if exists (select 1 from jsonb_array_elements(r->'items') it
               where (it->>'amount')::numeric < 0) then
      raise exception 'monto negativo en algún item (caso %)', c;
    end if;
  end loop;

  -- El wrapper público debe cablear igual (pct default 0.20).
  r := ketzal.preview_payment_plan(5000, current_date + 60, 'mensual');
  select sum((it->>'amount')::numeric) into s from jsonb_array_elements(r->'items') it;
  if s is distinct from 5000 then
    raise exception 'preview_payment_plan: Σ items % <> 5000', s;
  end if;

  -- Fail-closed: entradas inválidas DEBEN lanzar excepción.
  -- Patrón: ok=false si NO falló (malo); ok=true si falló (esperado).
  ok := false;
  begin perform ketzal._compute_payment_plan(1000, current_date, current_date - 1, 'mensual', 0.2);
  exception when others then ok := true; end;
  if not ok then raise exception 'fecha final <= inicio debió fallar'; end if;

  ok := false;
  begin perform ketzal._compute_payment_plan(1000, current_date, current_date + 30, 'anual', 0.2);
  exception when others then ok := true; end;
  if not ok then raise exception 'frecuencia inválida debió fallar'; end if;

  ok := false;
  begin perform ketzal._compute_payment_plan(1000, current_date, current_date + 30, 'mensual', 1.5);
  exception when others then ok := true; end;
  if not ok then raise exception 'pct fuera de rango debió fallar'; end if;

  ok := false;
  begin perform ketzal._compute_payment_plan(0, current_date, current_date + 30, 'mensual', 0.2);
  exception when others then ok := true; end;
  if not ok then raise exception 'total <= 0 debió fallar'; end if;

  raise notice 'money_invariants OK — 5 planes + wrapper + 4 casos de error';
end $$;
