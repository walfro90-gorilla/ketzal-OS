-- 006 — `suppliers` deja de ser un registro global: dimensión de propiedad + RLS.
--
-- DECISIÓN DEL FUNDADOR (2026-07-19): **la comisión es un término privado entre
-- agencias.** Wanderlust no debe ver lo que paga Border.
--
-- POR QUÉ NO BASTABA ESCONDER LA COLUMNA. La RLS de Postgres es por FILA, no por
-- columna, y `suppliers` no tenía **ninguna** columna de propiedad: nada ligaba
-- un proveedor con la agencia que lo dio de alta. Sin esa dimensión no existe la
-- pregunta "¿este proveedor es tuyo?", así que no había por dónde filtrar. El
-- registro era global: `/proveedores` le mostraba a cualquier agente TODOS los
-- proveedores de TODAS las agencias, con su comisión. La misma fuga que `005`
-- cerró para `anon`, todavía abierta para `authenticated`.
--
-- HALLAZGO DE PASO: `/comisiones` no tiene guarda de superadmin en el servidor —
-- `nav-items.ts` sólo **esconde el link**. Cualquier agente podía navegar directo
-- y leer todas las comisiones. Con esta migración la autorización deja de
-- depender de que la UI esconda cosas: la RLS la sostiene, que es como debe ser
-- en este stack.
--
-- MODELO: `owner_supplier_id` es NULL para las agencias (son de primer nivel, no
-- las posee nadie) y apunta a la agencia dueña para los proveedores operativos
-- (hotel, transporte). Backfill trivial: hoy las 4 filas son agencias y no hay
-- un solo proveedor operativo — por eso se hace ahora y no con 200 filas.
--
-- QUÉ SIGUE SIENDO VISIBLE ENTRE AGENCIAS: sólo el **nombre**, vía el RPC
-- `agency_name()` (SECURITY DEFINER), porque la reventa lo necesita — al ver una
-- venta revendida hay que poder decir de quién es el tour. El nombre no es
-- secreto; la comisión, el correo y el teléfono sí.

alter table ketzal.suppliers
  add column if not exists owner_supplier_id uuid
    references ketzal.suppliers(id) on delete set null;

comment on column ketzal.suppliers.owner_supplier_id is
  'Agencia dueña de este proveedor operativo. NULL en las agencias (son de primer nivel).';

create index if not exists suppliers_owner_idx on ketzal.suppliers (owner_supplier_id);

-- Backfill explícito: las agencias no tienen dueño. (Hoy las 4 filas son
-- agencias, así que esto es un no-op documental; queda escrito para cuando se
-- corra este archivo contra una BD restaurada del dump.)
update ketzal.suppliers set owner_supplier_id = null where supplier_type = 'agency';

-- ── LECTURA ────────────────────────────────────────────────────────────────
-- Antes: `qual = true` (cualquiera lee todo). Ahora: lo tuyo y nada más.
drop policy if exists suppliers_read on ketzal.suppliers;
create policy suppliers_read on ketzal.suppliers for select using (
  ketzal.is_superadmin()
  or id = ketzal.my_supplier_id()                 -- mi propia agencia
  or owner_supplier_id = ketzal.my_supplier_id()  -- los proveedores que yo di de alta
);

-- ── ESCRITURA ──────────────────────────────────────────────────────────────
-- Sin esto la columna sería decorativa: hoy `suppliers_insert` exige superadmin,
-- así que una agencia no puede registrar sus propios proveedores. Se abre, pero
-- sólo para colgarlos de uno mismo.
drop policy if exists suppliers_insert on ketzal.suppliers;
create policy suppliers_insert on ketzal.suppliers for insert with check (
  ketzal.is_superadmin()
  or (ketzal.is_active() and owner_supplier_id = ketzal.my_supplier_id())
);

drop policy if exists suppliers_update on ketzal.suppliers;
create policy suppliers_update on ketzal.suppliers for update using (
  ketzal.is_superadmin()
  or id = ketzal.my_supplier_id()
  or owner_supplier_id = ketzal.my_supplier_id()
);

drop policy if exists suppliers_delete on ketzal.suppliers;
create policy suppliers_delete on ketzal.suppliers for delete using (
  ketzal.is_superadmin()
  or owner_supplier_id = ketzal.my_supplier_id()   -- tus proveedores, no tu agencia
);

-- ── El nombre de una agencia ajena, y NADA más ─────────────────────────────
-- DEFINER a propósito: corre como owner y esquiva la policy de arriba, pero su
-- SELECT sólo puede devolver id y nombre. Es el mínimo que la reventa necesita.
create or replace function ketzal.agency_name(p_id uuid) returns text
  language sql stable security definer set search_path = 'ketzal', 'pg_temp'
as $$
  select name from ketzal.suppliers where id = p_id and supplier_type = 'agency';
$$;

create or replace function ketzal.list_agency_names() returns jsonb
  language sql stable security definer set search_path = 'ketzal', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from ketzal.suppliers where supplier_type = 'agency';
$$;

revoke execute on function ketzal.agency_name(uuid) from public;
revoke execute on function ketzal.list_agency_names() from public;
grant execute on function ketzal.agency_name(uuid) to authenticated;
grant execute on function ketzal.list_agency_names() to authenticated;
