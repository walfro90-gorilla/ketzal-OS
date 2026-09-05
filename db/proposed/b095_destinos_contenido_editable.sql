-- b095 — Contenido de destino editable desde el panel. (ADR-0053)
--
-- Migración aplicada: `b095_destinos_contenido_editable` (2026-09-05).
--
-- Sustituye a `src/lib/marketing/destinos-contenido.ts`, que nació ayer como
-- archivo del repo con un `ponytail:` que nombraba su disparador: "el día que
-- Meny necesite editarlos sin pasar por un deploy". El disparador se cumplió en
-- un día.
--
-- La LISTA de destinos no se administra aquí: sale del catálogo publicado
-- (`city_to` de los servicios). Esta tabla solo guarda lo EDITORIAL de cada uno
-- —dónde está, cómo se llega, por qué se visita, qué ver— más las coordenadas
-- para el mapa. Por eso la llave es el slug, no un uuid: es la misma llave que
-- `slugDestino()` calcula del catálogo, así que una fila sin servicios queda
-- huérfana y visible en el panel, en vez de desaparecer en silencio.
--
-- `pais` decide el mapa: los que no son de México se muestran aparte, como
-- "fuera de México", en vez de forzarlos dentro de un mapa donde no caben.

create table if not exists ketzal.destinos (
  slug         text primary key,
  nombre       text not null,
  estado       text,
  pais         text not null default 'México',
  lat          numeric(8,5),
  lng          numeric(8,5),
  ubicacion    text,
  como_llegar  text,
  por_que      text,
  cuando_ir    text,
  que_visitar  jsonb not null default '[]'::jsonb,
  publicado    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table ketzal.destinos
  drop constraint if exists destinos_que_visitar_chk;
alter table ketzal.destinos
  add constraint destinos_que_visitar_chk check (jsonb_typeof(que_visitar) = 'array');

-- Coordenadas plausibles o nulas; una mal tecleada saca el punto del mapa y
-- nadie lo nota mirando el formulario.
--
-- OJO con la lógica de tres valores: la primera versión decía
-- `lat between -90 and 90 and lng between -180 and 180`, y con lat puesta y lng
-- nula eso evalúa a NULL — que un CHECK **acepta**. Media coordenada pasaba. Por
-- eso la rama exige explícitamente que las dos sean NOT NULL. Lo cazó
-- `destinos_contenido.sql`, no la revisión a ojo.
alter table ketzal.destinos drop constraint if exists destinos_coords_chk;
alter table ketzal.destinos add constraint destinos_coords_chk check (
  (lat is null and lng is null)
  or (lat is not null and lng is not null
      and lat between -90 and 90 and lng between -180 and 180)
);

-- `clock_timestamp()` y NO `now()`: `now()` es la hora de la transacción, así
-- que editar una fila en la misma transacción en que se creó dejaba
-- `updated_at` idéntico a `created_at`. También lo cazó el harness.
create or replace function ketzal.tg_destinos_touch()
returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;

drop trigger if exists trg_destinos_touch on ketzal.destinos;
create trigger trg_destinos_touch before update on ketzal.destinos
  for each row execute function ketzal.tg_destinos_touch();

-- RLS: contenido de plataforma, lo administra el superadmin. El público NO lee
-- la tabla: lee el RPC de abajo, que solo devuelve lo publicado.
alter table ketzal.destinos enable row level security;

drop policy if exists destinos_admin_read on ketzal.destinos;
create policy destinos_admin_read on ketzal.destinos
  for select to authenticated using (coalesce(ketzal.is_superadmin(), false));

drop policy if exists destinos_admin_write on ketzal.destinos;
create policy destinos_admin_write on ketzal.destinos
  for all to authenticated
  using (coalesce(ketzal.is_superadmin(), false))
  with check (coalesce(ketzal.is_superadmin(), false));

grant select, insert, update, delete on ketzal.destinos to authenticated;

/**
 * Contenido público de destinos. SOLO lo publicado, y sin columnas internas.
 * SECURITY DEFINER para que el visitante anónimo no necesite tocar la tabla.
 */
create or replace function ketzal.list_destinos_publicos()
returns jsonb
language sql
stable security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.slug), '[]'::jsonb)
  from (
    select d.slug, d.nombre, d.estado, d.pais, d.lat, d.lng,
           d.ubicacion, d.como_llegar, d.por_que, d.cuando_ir, d.que_visitar
    from ketzal.destinos d
    where d.publicado
  ) t;
$function$;

revoke all on function ketzal.list_destinos_publicos() from public;
grant execute on function ketzal.list_destinos_publicos() to anon, authenticated, service_role;
