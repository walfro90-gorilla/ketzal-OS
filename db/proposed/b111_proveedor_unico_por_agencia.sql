-- b111 — El nombre de un proveedor es único DENTRO de su agencia, no en toda la plataforma.
--
-- Migración aplicada: `b111_proveedor_unico_por_agencia` (2026-09-09).
--
-- El bug: `suppliers` guarda las agencias (owner_supplier_id null) y los
-- proveedores que las surten (owner_supplier_id = la agencia) en la MISMA
-- tabla, y la tabla traía `UNIQUE (name)` / `UNIQUE (contact_email)` globales
-- desde el esquema original. Consecuencia: si Wanderlust ya dio de alta
-- "Rancho San Lorenzo", Border Travels YA NO PUEDE — el insert truena con
-- 23505 y el usuario lee "Los datos no cumplen una restricción de la base de
-- datos". El fundador opera tres agencias que comparten proveedores de la
-- misma región, así que el choque es el caso normal, no el borde.
--
-- Regla de oro 1 (tenencia por `supplier_id`): la unicidad de un proveedor es
-- por agencia dueña. La de una agencia sí es de plataforma — dos agencias con
-- el mismo nombre serían indistinguibles para todos.
--
-- Se aprovecha para volverla insensible a mayúsculas (`lower(...)`): con la
-- unicidad case-sensitive, "RANCHO SAN LORENZO" entraba como proveedor
-- distinto. Verificado antes de aplicar: 0 colisiones con `lower()` en los
-- datos vivos, así que los índices se crean sin tocar una fila.
--
-- El correo va con el mismo criterio, y sigue exigiendo `contact_email is not
-- null` para que los proveedores sin correo (b098 dejó el correo opcional) no
-- choquen entre ellos por el null.

begin;

alter table ketzal.suppliers drop constraint suppliers_name_key;
alter table ketzal.suppliers drop constraint suppliers_contact_email_key;

-- Agencias: únicas en toda la plataforma.
create unique index uq_suppliers_agencia_nombre
  on ketzal.suppliers (lower(name))
  where owner_supplier_id is null;

create unique index uq_suppliers_agencia_correo
  on ketzal.suppliers (lower(contact_email))
  where owner_supplier_id is null and contact_email is not null;

-- Proveedores: únicos dentro de la agencia que los surte.
create unique index uq_suppliers_proveedor_nombre
  on ketzal.suppliers (owner_supplier_id, lower(name))
  where owner_supplier_id is not null;

create unique index uq_suppliers_proveedor_correo
  on ketzal.suppliers (owner_supplier_id, lower(contact_email))
  where owner_supplier_id is not null and contact_email is not null;

commit;
