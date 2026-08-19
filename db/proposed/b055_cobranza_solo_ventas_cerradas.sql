-- b055 — Cobranza: solo ventas cerradas, no cotizaciones.
-- Migración aplicada: `b055_cobranza_solo_ventas_cerradas` (2026-08-19).
--
-- PROBLEMA
-- El filtro era `status <> 'cancelled'`, que dejaba entrar `draft`. Una
-- COTIZACIÓN todavía no es una venta: nadie se comprometió a pagarla, así que
-- su total no es dinero por cobrar. El efecto visible en producción era que
-- /cobranza (y el MCP, que llama el mismo RPC) reportaba $13,000 de saldo y
-- $2,700 de atraso que eran 3 cotizaciones abiertas.
--
-- DECISIÓN
-- Lista blanca explícita `in ('reserved','confirmed','paid')` en vez de negar
-- `draft`. Si mañana entra un estado nuevo al enum `booking_status`, no se cuela
-- solo a la cobranza: hay que decidirlo a mano, que es lo correcto para dinero.
--
-- Las cotizaciones no se tocan: siguen en su lista (/cotizaciones), con su folio
-- COT-n, y el Panel las sigue contando en `num_cotizaciones`. Sólo dejan de
-- contarse como cobranza. La regla de Clawbot `cotizacion_sin_cerrar` es
-- independiente y las sigue persiguiendo.
--
-- RE-APLICACIÓN ADITIVA desde el DDL vivo: sigue siendo LANGUAGE sql STABLE e
-- INVOKER (la RLS por agencia es la que acota — no hay guard que preservar),
-- misma forma del jsonb, mismas keys y mismo orden. Sólo cambia el WHERE.
--
-- HARD-TEST (rollback garantizado vía RAISE dentro de un DO block):
--   antes de la migración : num_ventas=3  saldo=13000  atrasado=2700
--   después              : num_ventas=0  saldo=0      atrasado=0
--   control (ventas cerradas con saldo, contadas aparte): 0  ✓ coincide
--   caso positivo: la MISMA cotización promovida a 'reserved' vuelve a contar
--                  (num_ventas=1, saldo=4500) y el rollback la dejó en 'draft'
--   cotizaciones intactas: 3 · verificar_invariantes: 0 · advisors: 0 ERROR
--
-- COORDINACIÓN: ninguna otra función de la BD llama a `cobranza()` (verificado
-- contra pg_proc), y en la app la consumen `src/app/(ops)/cobranza/data.ts` y el
-- MCP, ambos sin argumentos. No hubo cambio de firma ⇒ no hay que tocar código.

create or replace function ketzal.cobranza()
 returns jsonb
 language sql
 stable
 set search_path to 'ketzal', 'public'
as $function$
  with base as (
    select b.id, b.payment_type, b.plan_frequency, b.due_date, b.travel_date,
           coalesce(cu.full_name, 'Sin cliente') as cliente,
           coalesce(sv.name, 'A medida')        as servicio,
           bwb.total, bwb.paid, bwb.balance
    from ketzal.bookings b
    join ketzal.bookings_with_balance bwb on bwb.id = b.id
    left join ketzal.customers cu on cu.id = b.customer_id
    left join ketzal.services  sv on sv.id = b.service_id
    -- b055: antes `b.status <> 'cancelled'`, que incluía las cotizaciones.
    where b.status in ('reserved', 'confirmed', 'paid') and bwb.balance > 0
  ),
  sched as (
    select ps.booking_id,
           sum(ps.amount) filter (where ps.due_date <= current_date) as esperado_hoy
    from ketzal.payment_schedule ps
    group by ps.booking_id
  ),
  prox as (
    select distinct on (ps.booking_id) ps.booking_id, ps.due_date, ps.amount
    from ketzal.payment_schedule ps
    where ps.due_date >= current_date
    order by ps.booking_id, ps.due_date
  ),
  rows as (
    select base.*,
           p.due_date as proximo_due,
           p.amount   as proximo_monto,
           greatest(0, round(coalesce(s.esperado_hoy, 0) - base.paid, 2)) as atrasado
    from base
    left join sched s on s.booking_id = base.id
    left join prox  p on p.booking_id = base.id
  )
  select jsonb_build_object(
    'total_saldo',    coalesce(sum(balance), 0),
    'total_atrasado', coalesce(sum(atrasado), 0),
    'num_ventas',     count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'cliente', cliente, 'servicio', servicio,
        'total', total, 'pagado', paid, 'saldo', balance,
        'con_plan', payment_type = 'abonos',
        'frecuencia', plan_frequency,
        'proximo_due', proximo_due, 'proximo_monto', proximo_monto,
        'atrasado', atrasado, 'due_date', due_date, 'travel_date', travel_date)
      order by atrasado desc, proximo_due asc nulls last, travel_date asc nulls last), '[]'::jsonb)
  )
  from rows;
$function$;
