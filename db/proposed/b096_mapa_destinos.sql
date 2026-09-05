-- b096 — Los puntos del mapa no dependen de que el TEXTO esté publicado. (ADR-0054)
--
-- Migración aplicada: `b096_mapa_destinos` (2026-09-05).
--
-- `list_destinos_publicos()` (b095) filtra por `publicado` a propósito: un
-- borrador de texto no debe llegar a la vitrina. Pero las coordenadas viven en
-- la misma fila, y con ese filtro el mapa quedaba vacío hasta que alguien
-- publicara la prosa — dos cosas distintas atadas al mismo interruptor.
--
-- La distinción: `publicado` gobierna el TEXTO EDITORIAL. La existencia del
-- destino y dónde queda **ya son públicas** por el catálogo (tiene su propia
-- página en /viajes/<slug>), así que ponerlo en el mapa no revela nada nuevo.
--
-- Devuelve solo filas CON coordenadas: un destino sin ubicar no es un punto.

create or replace function ketzal.list_destinos_mapa()
returns jsonb
language sql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.slug), '[]'::jsonb)
  from (
    select d.slug, d.nombre, d.pais, d.lat, d.lng
    from ketzal.destinos d
    where d.lat is not null and d.lng is not null
  ) t;
$function$;

revoke all on function ketzal.list_destinos_mapa() from public;
grant execute on function ketzal.list_destinos_mapa() to anon, authenticated, service_role;
