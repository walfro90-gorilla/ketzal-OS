-- b099 — Calendario de huecos. (ADR-0058)
--
-- Migración aplicada: `b099_calendario_huecos` (2026-09-07).
--
-- El "calendario inteligente" es una consulta: temporadas fijas (función pura
-- en git, `src/lib/domain/temporadas-mx.ts`) menos las salidas de la agencia
-- contando `departs_on + duration_days`. Para eso la BD necesita:
--
-- 1. `services.duration_days`: sin fin de salida no se sabe si un tour de tres
--    días que sale el viernes cubre el puente del lunes. Opcional; sin él se
--    asume 1 día.
-- 2. `services.meses_ideales`: filtro determinista de qué servicios se sugieren
--    (Huasteca en septiembre no). Opcional; sin meses se sugiere siempre.
-- 3. `suppliers.alcances_temporada`: qué calendarios ve la agencia (`nacional`,
--    `frontera`). Border vende a fronterizos: Thanksgiving mueve más gente que
--    el 5 de febrero.
-- 4. `oportunidades_fecha`: el historial. Cada sugerencia emitida y qué pasó
--    con ella (descartada, o tomada con el `departure_id` que nació de ella),
--    para poder medir en 2027. Las ventas por temporada NO se guardan: se
--    derivan cruzando `bookings` con `departs_on` (ADR-0005).

alter table ketzal.services
  add column if not exists duration_days integer,
  add column if not exists meses_ideales integer[];

alter table ketzal.services drop constraint if exists services_duration_days_chk;
alter table ketzal.services add constraint services_duration_days_chk
  check (duration_days is null or duration_days between 1 and 365);

alter table ketzal.services drop constraint if exists services_meses_ideales_chk;
alter table ketzal.services add constraint services_meses_ideales_chk
  check (meses_ideales is null or meses_ideales <@ array[1,2,3,4,5,6,7,8,9,10,11,12]);

alter table ketzal.suppliers
  add column if not exists alcances_temporada text[] not null default array['nacional'];

alter table ketzal.suppliers drop constraint if exists suppliers_alcances_chk;
alter table ketzal.suppliers add constraint suppliers_alcances_chk
  check (cardinality(alcances_temporada) >= 1
         and alcances_temporada <@ array['nacional','frontera']);

create table if not exists ketzal.oportunidades_fecha (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references ketzal.suppliers(id) on delete cascade,
  clave         text not null check (clave ~ '^[a-z0-9-]+$'),
  anio          integer not null,
  inicio        date not null,
  fin           date not null,
  emitida_at    timestamptz not null default now(),
  descartada_at timestamptz,
  departure_id  uuid references ketzal.service_departures(id) on delete set null,
  texto_ia      text,
  texto_ia_at   timestamptz,
  unique (supplier_id, clave, anio),
  check (inicio <= fin)
);

create index if not exists oportunidades_fecha_agencia_idx
  on ketzal.oportunidades_fecha (supplier_id, anio);

alter table ketzal.oportunidades_fecha enable row level security;

-- La ven y la escriben los miembros de la agencia (admin y agente) y el
-- superadmin. Sin policy de delete: el historial se conserva (ADR-0058 §9).
drop policy if exists oportunidades_sel on ketzal.oportunidades_fecha;
create policy oportunidades_sel on ketzal.oportunidades_fecha
for select to authenticated
using (coalesce(ketzal.is_superadmin(), false) or supplier_id = ketzal.my_supplier_id());

drop policy if exists oportunidades_ins on ketzal.oportunidades_fecha;
create policy oportunidades_ins on ketzal.oportunidades_fecha
for insert to authenticated
with check (coalesce(ketzal.is_superadmin(), false) or supplier_id = ketzal.my_supplier_id());

drop policy if exists oportunidades_upd on ketzal.oportunidades_fecha;
create policy oportunidades_upd on ketzal.oportunidades_fecha
for update to authenticated
using (coalesce(ketzal.is_superadmin(), false) or supplier_id = ketzal.my_supplier_id())
with check (coalesce(ketzal.is_superadmin(), false) or supplier_id = ketzal.my_supplier_id());

grant select, insert, update on ketzal.oportunidades_fecha to authenticated;
grant all on ketzal.oportunidades_fecha to service_role;
