-- b101 — Packs de cabaña y camping; cabecera del costeo con precio de venta,
-- imprevistos y portal. (ADR-0061)
--
-- Migración aplicada: `b101_packs_cabanas_camping_y_costeo_precio` (2026-09-08).
--
-- 1. Las opciones de precio (`services.packs`, `pack_price_overrides`,
--    `cost_by_pack` del tarifario) eran cuatro ocupaciones de hotel. Un
--    proveedor de cabañas vende unidades de 6, 8 y 10 personas y un campamento
--    espacios para 2 y 4: mismo modelo (precio por persona por unidad de N),
--    más ocupaciones. Se agregan `cabana6`, `cabana8`, `cabana10`, `camping2`,
--    `camping4` a la lista del CHECK.
-- 2. `service_costings.doc` gana tres campos opcionales: `precio_venta`
--    (> 0 o null: el precio que la persona quiere probar), `imprevistos_pct`
--    (0..100, colchón sobre el costo) y `portal` (boolean: la utilidad neta
--    descuenta la comisión de Ketzal). Sin ellos el documento sigue siendo
--    válido: los costeos guardados no se tocan.
--
-- Re-aplicado desde el DDL vivo (pg_get_functiondef), conservando lo demás.

create or replace function ketzal.valid_pack_price_overrides(v jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select v is null or (
    jsonb_typeof(v) = 'object'
    and not exists (
      select 1 from jsonb_each(v) e(k, val)
      where k not in ('sencilla','doble','triple','cuadruple',
                      'cabana6','cabana8','cabana10','camping2','camping4')
         or jsonb_typeof(val) <> 'number'
         or (val)::text::numeric <= 0
    )
  );
$$;

create or replace function ketzal.valid_costing(v jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select v is null or coalesce((
    jsonb_typeof(v) = 'object'
    and coalesce(ketzal.jsonb_num(v->'plan_pax') >= 1
                 and ketzal.jsonb_num(v->'plan_pax') = floor(ketzal.jsonb_num(v->'plan_pax')), false)
    and coalesce(ketzal.jsonb_num(v->'days') >= 1
                 and ketzal.jsonb_num(v->'days') = floor(ketzal.jsonb_num(v->'days')), false)
    and coalesce(ketzal.jsonb_num(v->'nights') >= 0, false)
    and coalesce(ketzal.jsonb_num(v->'margin_pct') >= 0
                 and ketzal.jsonb_num(v->'margin_pct') < 100, false)
    -- b101: opcionales; si vienen, con rango.
    and (not (v ? 'imprevistos_pct')
         or coalesce(ketzal.jsonb_num(v->'imprevistos_pct') between 0 and 100, false))
    and (not (v ? 'precio_venta') or jsonb_typeof(v->'precio_venta') = 'null'
         or coalesce(ketzal.jsonb_num(v->'precio_venta') > 0, false))
    and (not (v ? 'portal') or jsonb_typeof(v->'portal') = 'boolean')
    and case when jsonb_typeof(v->'lines') = 'array' then
          not exists (
            select 1 from jsonb_array_elements(v->'lines') l
            where not ketzal.valid_rate_body(l)
               or coalesce(trim(l->>'supplier_id'), '') = ''
               or (l->>'unit' <> 'habitacion'
                   and not coalesce(ketzal.jsonb_num(l->'qty') > 0, false))
          )
        else false end
    and case when jsonb_typeof(v->'addon_costs') = 'object' then
          not exists (
            select 1 from jsonb_each(v->'addon_costs') a(k, val)
            where jsonb_typeof(val) <> 'object'
               or not coalesce(ketzal.jsonb_num(val->'cost') >= 0, false)
          )
        else false end
  ), false);
$$;
