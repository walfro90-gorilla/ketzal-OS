-- b100 — Unidad "noche" en el tarifario y el costeo. (ADR-0055 ampliado)
--
-- Migración aplicada: `b100_tarifa_por_noche` (2026-09-08).
--
-- El primer proveedor real de hospedaje rústico (Cabañas Rancho San Lorenzo,
-- Basaseachi) cobra POR NOCHE y POR UNIDAD con cupo: cabaña para 8 a $1,900 la
-- noche, camping a $600 la noche por vehículo hasta 5 personas. Ninguna de las
-- cuatro unidades de b097 lo decía bien: `habitacion` es por pack de ocupación
-- (una cabaña de 8 no es doble ni cuádruple) y `dia` se precarga con los días
-- del viaje cuando lo que se paga son las noches (un fin de semana son 2 días y
-- 1 noche). `noche` escala igual que `dia` (costo · noches · unidades) y el form
-- la precarga con las noches de la cabecera.
--
-- Solo cambia la lista de unidades del CHECK; `valid_costing` llama a esta
-- misma función, así que el costeo la acepta sin tocarlo. Re-aplicado desde el
-- DDL vivo de b097 (leído con pg_get_functiondef), conservando lo demás.

create or replace function ketzal.valid_rate_body(r jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce((
    jsonb_typeof(r) = 'object'
    and coalesce(trim(r->>'label'), '') <> ''
    and coalesce(r->>'unit', '') in ('pax','grupo','dia','noche','habitacion')
    and case when r->>'unit' = 'habitacion'
          then coalesce(jsonb_typeof(r->'cost_by_pack') = 'object'
                        and r->'cost_by_pack' <> '{}'::jsonb
                        and ketzal.valid_pack_price_overrides(r->'cost_by_pack'), false)
          else coalesce(ketzal.jsonb_num(r->'cost') >= 0, false)
        end
    and (not (r ? 'cap')
         or coalesce(ketzal.jsonb_num(r->'cap') > 0
                     and ketzal.jsonb_num(r->'cap') = floor(ketzal.jsonb_num(r->'cap')), false))
  ), false);
$$;
