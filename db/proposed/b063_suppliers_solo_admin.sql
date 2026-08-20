-- b063 — tocar la ficha de una agencia exige ser ADMIN de esa agencia.
-- Migración aplicada: `b063_suppliers_solo_admin` (2026-08-19).
--
-- ══ EL HUECO — el más grave de la tanda ══
-- `suppliers_update` era `is_superadmin() OR id = my_supplier_id() OR
-- owner_supplier_id = my_supplier_id()`: bastaba PERTENECER a la agencia, sin
-- mirar el rol. Un agente raso (`role='user'`) podía editar la ficha de su
-- propia agencia.
--
-- Y en `suppliers.info` vive la CLABE a la que se dirigen los pagos SPEI.
-- Comprobado en vivo con un perfil degradado a `role='user'`:
--     cambiar CLABE de su agencia ... 1 fila
--     CLABE tras el intento: 012345678901234567
-- O sea: un agente de ventas podía redirigir a su cuenta bancaria el dinero de
-- todos los clientes de la agencia. También podía alterar `commission_rate`.
--
-- La UI ya lo impedía (`/proveedores` y `/ajustes` están en `ADMIN_HREFS`), pero
-- eso es gating de navegación, no una frontera: cualquier autenticado llega a la
-- tabla por PostgREST. Misma divergencia UI-vs-BD que b059 y b060.
--
-- ══ EL ARREGLO ══
-- Las tres policies de escritura exigen `is_agency_admin()` (b018), que verifica
-- admin ACTIVO de esa agencia. Se conserva la rama de `owner_supplier_id` para
-- que el admin gestione los proveedores que cuelgan de su agencia.
--
-- No rompe nada: `/proveedores` y `/ajustes` ya eran adminOnly, la creación de
-- agencias la hace el superadmin (`crearAgenciaEInvitarAdmin`) y el callback de
-- OAuth de Mercado Pago escribe con service_role, que no pasa por RLS.
--
-- ══ HARD-TEST (rollback) ══
--   AGENTE RASO (role=user):  cambiar CLABE 0 filas · cambiar comisión 0 filas
--   ADMIN DE LA AGENCIA:      cambiar CLABE OK · crear proveedor hijo OK
--   PROVEEDOR:                renombrar la agencia 0 filas
--   AGENTE LIBRE:             crear proveedor BLOQUEADO
--   CLABE final = la que puso el admin (el ataque no dejó rastro)

drop policy suppliers_update on ketzal.suppliers;
create policy suppliers_update on ketzal.suppliers
for update to authenticated
using (
  ketzal.is_superadmin()
  or ketzal.is_agency_admin(id)
  or (owner_supplier_id is not null and ketzal.is_agency_admin(owner_supplier_id))
);

drop policy suppliers_insert on ketzal.suppliers;
create policy suppliers_insert on ketzal.suppliers
for insert to authenticated
with check (
  ketzal.is_superadmin()
  or (owner_supplier_id is not null and ketzal.is_agency_admin(owner_supplier_id))
);

drop policy suppliers_delete on ketzal.suppliers;
create policy suppliers_delete on ketzal.suppliers
for delete to authenticated
using (
  ketzal.is_superadmin()
  or (owner_supplier_id is not null and ketzal.is_agency_admin(owner_supplier_id))
);

-- Se evalúa dentro de la policy ⇒ lo corre el rol del que escribe, no el owner.
-- (Misma lección que `es_staff_de_booking` en b061.)
grant execute on function ketzal.is_agency_admin(uuid) to authenticated, service_role;
