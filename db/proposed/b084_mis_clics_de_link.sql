-- b084 — El embajador ve cuánta gente abrió sus links.
-- Espejo de `b084_mis_clics_de_link`, `b084b_funnel_events_acepta_link_click`
-- y `b084c_total_de_clics_cuenta_personas_no_suma`.
--
-- `funnel_events` es deny-all (solo escribe /api/track con service role, nadie
-- lee por REST), así que hace falta un RPC agregado. Devuelve SOLO CONTEOS:
-- cuántas personas, nunca quiénes. Un embajador viendo "Juan abrió tu link 3
-- veces" es vigilancia y no le sirve para vender.
--
-- Se cuentan SESIONES DISTINTAS, no filas: recargar no infla el número, y
-- "12 personas" significa 12 personas.
--
-- b084c corrige el total, que sumaba los conteos POR SERVICIO: una sola persona
-- que miraba la vitrina y dos tours salía como "3 personas". El embajador lee
-- ese número como gente; inflado es peor que no tenerlo, porque la primera vez
-- que comparte con dos amigos y el panel dice 5, deja de creerle a todo.
--
-- b084b: el allowlist de /api/track y el CHECK de la tabla son DOS candados.
-- Se agregó 'link_click' al handler y la BD lo rechazaba con 23514; lo cazó el
-- hard-test antes de llegar a producción.
alter table ketzal.funnel_events drop constraint if exists funnel_events_event_check;
alter table ketzal.funnel_events add constraint funnel_events_event_check check (
  event = any (array['checkout_open','order_created','pago_metodo','link_click'])
);

create or replace function ketzal.my_link_clicks()
returns jsonb
language sql stable security definer set search_path to 'ketzal', 'pg_temp'
as $function$
with yo as (
  select id, referral_code from ketzal.profiles where id = auth.uid()
),
mios as (
  select fe.session_id, fe.service_id
  from ketzal.funnel_events fe
  join yo on yo.referral_code is not null
         and upper(fe.meta->>'ref') = yo.referral_code
  where fe.event = 'link_click'
),
clics as (
  select service_id, count(distinct session_id)::int as clics
  from mios group by service_id
),
cotizando as (
  select b.service_id, count(*)::int as n
  from ketzal.bookings b
  join yo on b.ambassador_id = yo.id
  where b.status = 'draft'
  group by b.service_id
),
juntos as (
  select coalesce(c.service_id, q.service_id) as service_id,
         coalesce(c.clics, 0) as clics,
         coalesce(q.n, 0) as cotizando
  from clics c
  full outer join cotizando q on q.service_id = c.service_id
)
select jsonb_build_object(
  -- PERSONAS, no suma de conteos: quien ve la vitrina y dos tours es UNA.
  'total_clics', (select count(distinct session_id)::int from mios),
  'en_cotizacion', coalesce((select sum(n) from cotizando), 0),
  'por_servicio', coalesce((
    select jsonb_agg(jsonb_build_object(
             'service_id', j.service_id,
             'nombre', s.name,
             'clics', j.clics,
             'cotizando', j.cotizando)
           order by j.clics desc, j.cotizando desc)
    from juntos j
    left join ketzal.services s on s.id = j.service_id
    where j.service_id is not null
  ), '[]'::jsonb)
)
from yo;
$function$;

revoke all on function ketzal.my_link_clicks() from public, anon;
grant execute on function ketzal.my_link_clicks() to authenticated, service_role;
