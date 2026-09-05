-- b097 — Costeo de tours: tarifario por proveedor y hoja de costeo por servicio. (ADR-0055)
--
-- Migración aplicada: `b097_costeo` (2026-09-05).
--
-- Por qué: ningún tour del OS sabía cuánto cuesta. `services` no tiene una sola
-- columna de costo y `add_ons` es `{key,label,price}` sin dueño ni costo, así
-- que el margen vivía en la cabeza del fundador y el pago al prestador se hacía
-- de memoria. Esto guarda el PLAN: qué proveedores entran a un tour, con qué
-- tarifa, y a cuántos pasajeros se gana.
--
-- ADITIVA: dos tablas nuevas 1:1 (doc jsonb + validador), RLS solo para el admin
-- de la agencia dueña (y superadmin). No toca services, suppliers, expenses ni
-- ninguna policy existente.
--
-- El costeo es un PLAN, no un ledger (ADR-0005/0006): no crea CxP ni toca
-- `expenses`; por eso no es RPC-only-write, no es tabla de dinero.
--
-- El costo lo ven SOLO los admins ⇒ no puede vivir en `services`: RLS es por
-- fila, `services_read` deja leer filas publicadas a cualquiera y
-- `get_public_service` devuelve `add_ons`. Un jsonb ahí filtraría el tarifario
-- al público.
--
-- Validadores: un CHECK acepta NULL (b095b lo cazó con media coordenada), así
-- que cada predicado va con `coalesce(..., false)` y las iteraciones sobre
-- jsonb van dentro de `case` (el orden de evaluación de un `and` no está
-- garantizado y `jsonb_array_elements` truena sobre un objeto).

-- ---------- 1. Helpers de validación --------------------------------------

-- Número del jsonb o NULL si no es número (evita casts que truenan).
create or replace function ketzal.jsonb_num(v jsonb)
returns numeric
language sql
immutable
set search_path to ''
as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric else null end;
$$;

-- Cuerpo de una tarifa (tarifario y línea de costeo comparten forma):
--   { label, unit: pax|grupo|dia|habitacion, cost >= 0 (no habitación),
--     cap int > 0 opcional, cost_by_pack (habitación: subconjunto de los 4 packs, > 0) }
create or replace function ketzal.valid_rate_body(r jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce((
    jsonb_typeof(r) = 'object'
    and coalesce(trim(r->>'label'), '') <> ''
    and coalesce(r->>'unit', '') in ('pax','grupo','dia','habitacion')
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

-- Tarifario: arreglo de tarifas con `key` única y no vacía.
create or replace function ketzal.valid_rate_card(v jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select v is null or coalesce((
    case when jsonb_typeof(v) = 'array' then
      not exists (
        select 1 from jsonb_array_elements(v) r
        where not ketzal.valid_rate_body(r)
           or coalesce(trim(r->>'key'), '') = ''
      )
      and (select count(*) = count(distinct r->>'key') from jsonb_array_elements(v) r)
    else false end
  ), false);
$$;

-- Hoja de costeo: cabecera + líneas (snapshot con proveedor) + costo de add-ons.
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

revoke all on function ketzal.jsonb_num(jsonb) from public;
revoke all on function ketzal.valid_rate_body(jsonb) from public;
revoke all on function ketzal.valid_rate_card(jsonb) from public;
revoke all on function ketzal.valid_costing(jsonb) from public;
grant execute on function ketzal.jsonb_num(jsonb) to authenticated, service_role;
grant execute on function ketzal.valid_rate_body(jsonb) to authenticated, service_role;
grant execute on function ketzal.valid_rate_card(jsonb) to authenticated, service_role;
grant execute on function ketzal.valid_costing(jsonb) to authenticated, service_role;

-- ---------- 2. Tablas ------------------------------------------------------

-- Tarifario del proveedor (lo captura la agencia dueña; tarifa negociada).
create table if not exists ketzal.supplier_rate_cards (
  supplier_id uuid primary key references ketzal.suppliers(id) on delete cascade,
  rates       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint supplier_rate_cards_rates_chk check (ketzal.valid_rate_card(rates))
);

-- Hoja de costeo del servicio. Cada línea es un SNAPSHOT de la tarifa elegida
-- (nombre, costo, proveedor): si el tarifario cambia o el proveedor se borra,
-- el costeo guardado no se mueve solo.
create table if not exists ketzal.service_costings (
  service_id  uuid primary key references ketzal.services(id) on delete cascade,
  doc         jsonb not null,
  updated_at  timestamptz not null default now(),
  constraint service_costings_doc_chk check (ketzal.valid_costing(doc))
);

drop trigger if exists trg_supplier_rate_cards_updated_at on ketzal.supplier_rate_cards;
create trigger trg_supplier_rate_cards_updated_at before update on ketzal.supplier_rate_cards
  for each row execute function ketzal.set_updated_at();

drop trigger if exists trg_service_costings_updated_at on ketzal.service_costings;
create trigger trg_service_costings_updated_at before update on ketzal.service_costings
  for each row execute function ketzal.set_updated_at();

-- ---------- 3. RLS: solo el admin de la agencia dueña (o superadmin) ------

alter table ketzal.supplier_rate_cards enable row level security;
alter table ketzal.service_costings enable row level security;

-- Dueño del tarifario = agencia dueña del proveedor (`suppliers.owner_supplier_id`).
-- Un proveedor sin dueño (legado) solo lo toca el superadmin. Calco de
-- `suppliers_update` (b063) con el `coalesce` de m004.
drop policy if exists rate_cards_admin_sel on ketzal.supplier_rate_cards;
create policy rate_cards_admin_sel on ketzal.supplier_rate_cards
for select to authenticated
using (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.suppliers s
    where s.id = supplier_id
      and s.owner_supplier_id is not null
      and coalesce(ketzal.is_agency_admin(s.owner_supplier_id), false))
);

drop policy if exists rate_cards_admin_ins on ketzal.supplier_rate_cards;
create policy rate_cards_admin_ins on ketzal.supplier_rate_cards
for insert to authenticated
with check (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.suppliers s
    where s.id = supplier_id
      and s.owner_supplier_id is not null
      and coalesce(ketzal.is_agency_admin(s.owner_supplier_id), false))
);

drop policy if exists rate_cards_admin_upd on ketzal.supplier_rate_cards;
create policy rate_cards_admin_upd on ketzal.supplier_rate_cards
for update to authenticated
using (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.suppliers s
    where s.id = supplier_id
      and s.owner_supplier_id is not null
      and coalesce(ketzal.is_agency_admin(s.owner_supplier_id), false))
)
with check (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.suppliers s
    where s.id = supplier_id
      and s.owner_supplier_id is not null
      and coalesce(ketzal.is_agency_admin(s.owner_supplier_id), false))
);

-- Dueño del costeo = agencia dueña del servicio.
drop policy if exists costings_admin_sel on ketzal.service_costings;
create policy costings_admin_sel on ketzal.service_costings
for select to authenticated
using (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.services x
    where x.id = service_id
      and coalesce(ketzal.is_agency_admin(x.supplier_id), false))
);

drop policy if exists costings_admin_ins on ketzal.service_costings;
create policy costings_admin_ins on ketzal.service_costings
for insert to authenticated
with check (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.services x
    where x.id = service_id
      and coalesce(ketzal.is_agency_admin(x.supplier_id), false))
);

drop policy if exists costings_admin_upd on ketzal.service_costings;
create policy costings_admin_upd on ketzal.service_costings
for update to authenticated
using (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.services x
    where x.id = service_id
      and coalesce(ketzal.is_agency_admin(x.supplier_id), false))
)
with check (
  ketzal.is_superadmin()
  or exists (
    select 1 from ketzal.services x
    where x.id = service_id
      and coalesce(ketzal.is_agency_admin(x.supplier_id), false))
);

-- Sin policy de delete: un costeo se vacía, no se borra; el cascade del padre
-- (servicio / proveedor) es el único camino. El anónimo no tiene ni grant.
grant select, insert, update on ketzal.supplier_rate_cards to authenticated, service_role;
grant select, insert, update on ketzal.service_costings to authenticated, service_role;
revoke delete on ketzal.supplier_rate_cards from authenticated;
revoke delete on ketzal.service_costings from authenticated;
