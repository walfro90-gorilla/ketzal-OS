-- b094 — El listado público dice DESDE DÓNDE sale y CUÁNDO. (ADR-0051)
--
-- Migración aplicada: `b094_listado_publico_con_origen_y_salidas` (2026-09-05).
--
-- Por qué: las páginas por destino tienen que responder la pregunta que la gente
-- escribe en el buscador ("tours a Creel desde Ciudad Juárez precio"), y el RPC
-- del catálogo solo devolvía destino, precio y agencia. Sin origen ni fechas, la
-- página sería un /explora filtrado — contenido casi duplicado, que en SEO hace
-- daño en vez de sumar.
--
-- ADITIVA: se agregan claves al jsonb; los consumidores actuales (/explora,
-- sitemap, llms.txt) leen claves por nombre y no se enteran. No cambia la firma,
-- ni los permisos, ni el filtro `published`.
--
-- `next_departure` y `departures_count` cuentan SOLO salidas futuras: una fecha
-- pasada en la página es peor que no poner fecha.

create or replace function ketzal.list_public_services()
returns jsonb
language sql
stable security definer
set search_path to 'ketzal', 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from (
    select s.id, s.name, s.price, s.service_type, s.service_category,
           s.city_to, s.state_to, s.location,
           s.city_from, s.state_from,
           d.next_departure, coalesce(d.departures_count, 0) as departures_count,
           s.images->>'imgBanner' as image,
           sup.name as agency
    from ketzal.services s
    join ketzal.suppliers sup on sup.id = s.supplier_id
    left join lateral (
      select min(sd.departs_on) as next_departure, count(*) as departures_count
      from ketzal.service_departures sd
      where sd.service_id = s.id and sd.departs_on >= current_date
    ) d on true
    where s.published
    order by s.name
  ) t;
$function$;
