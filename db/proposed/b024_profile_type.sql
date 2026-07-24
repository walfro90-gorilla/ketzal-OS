-- b024 — Refactor de identidad, Fase 0: fundación `profiles.type`
-- Espejo de la migración aplicada `b024_profile_type` (prod wnujoyzdpdyxblgdtxjw).
--
-- Principio del fundador: todo usuario de Ketzal = 1 profile; se diferencia por
-- `type` (proveedor/embajador/viajero + agente/admin internos), NO por "¿existe
-- fila en profiles?". Esta fase solo pone la fundación: sin cambio de
-- comportamiento (el único profile en prod hoy queda 'agente').
-- Plan completo: docs/REFACTOR_IDENTIDAD.md

-- 1. Enum de tipo de persona. `role` (user/admin/superadmin) queda ortogonal = permiso.
do $$ begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'ketzal' and t.typname = 'profile_type'
  ) then
    create type ketzal.profile_type as enum ('agente','proveedor','embajador','viajero');
  end if;
end $$;

-- 2. Columna type. Default 'agente' ⇒ backfillea las filas existentes y todo
--    insert que la omita (incl. ensure_profile) sigue naciendo agente.
--    ponytail: el default cubre el backfill y el path del agente ⇒ NO se re-aplica
--    ensure_profile (evita re-tocar un DEFINER compartido). El único writer que
--    querrá otro type (register_traveler en F1) lo pondrá explícito.
alter table ketzal.profiles
  add column if not exists type ketzal.profile_type not null default 'agente';

-- 3. Helper: tipo de persona del usuario actual (null si no tiene profile).
create or replace function ketzal.my_profile_type()
returns ketzal.profile_type
language sql
stable
security definer
set search_path to ''
as $$
  select type from ketzal.profiles where id = auth.uid();
$$;

revoke all on function ketzal.my_profile_type() from public, anon;
grant execute on function ketzal.my_profile_type() to authenticated, service_role;
