-- b059 — `services_read` deja de mostrar el catálogo interno de otras agencias.
-- Migración aplicada: `b059_services_read_acotada` (2026-08-19).
--
-- EL HUECO: la policy era `USING (auth.uid() IS NOT NULL OR published)`, o sea
-- CUALQUIER autenticado veía TODOS los servicios, publicados o no, de todas las
-- agencias — precios, packs, cupos e itinerarios incluidos. Verificado en vivo
-- antes del cambio: las cuentas de viajero, embajador y proveedor devolvían los
-- 13 servicios, incluidos los 11 internos (no publicados) de Border Travels.
-- Es la familia #1 del repo (ver memoria `seguridad-rls-postgrest`): policy
-- demasiado amplia + GRANT ⇒ alcanzable por PostgREST desde el navegador, sin
-- pasar por la app. Hoy el fundador es dueño de las dos agencias, así que el
-- daño es cero; con una agencia ajena en el modelo SaaS es una fuga comercial.
--
-- LA REGLA NUEVA, cuatro ramas y ninguna de más:
--   1. `published`                      → vitrina pública y anónima (/explora, ficha)
--   2. superadmin                       → plataforma
--   3. `supplier_id = my_supplier_id()` → staff de la agencia dueña. Cubre también
--      al PROVEEDOR, que lleva supplier_id y sólo debe ver lo de su proveedor.
--   4. agente libre de Ketzal           → vende todo el catálogo: es la tesis del
--      negocio ("supplier_id null, vende todo, comisión de plataforma").
--
-- POR QUÉ HACE FALTA `is_free_agent()` Y NO BASTA `my_supplier_id() IS NULL`:
-- el embajador y el viajero también tienen `supplier_id` null. Sin discriminar
-- por `type='agente'`, la rama 4 les reabriría todo el catálogo interno — justo
-- el hueco que se está cerrando. El helper es DEFINER como sus hermanos
-- (`is_superadmin`, `my_supplier_id`) y por eso hereda el mismo advisor WARN
-- "Public Can Execute SECURITY DEFINER Function": es inherente a un helper de
-- RLS, que tiene que ser ejecutable para que la policy evalúe. No expone nada
-- (devuelve un booleano sobre el propio `auth.uid()`).
--
-- NO ES REGRESIÓN DE REVENTA, aunque lo parezca: `/ventas/nueva` YA filtraba por
-- `supplier_id` para agentes de agencia (`src/app/(ops)/ventas/nueva/page.tsx:30`),
-- así que un agente de A nunca vendió servicios de B desde ahí — sólo el agente
-- libre ve todo, y la rama 4 se lo conserva. Este cambio hace que la BD coincida
-- con lo que la UI ya imponía; elimina una divergencia, no una función.
-- Si algún día hace falta distinguir "visible en internet" de "revendible entre
-- agencias", eso es una columna nueva en `services`, no ensanchar esta policy.
--
-- ══ HARD-TEST EN VIVO, LAS 8 POSICIONES ══
-- Por HTTP con JWT real (3 cuentas con contraseña) y por SQL suplantando el JWT
-- + `set role authenticated` para las demás — sin bajar el rol la RLS no aplica
-- (el owner la bypassa) y la prueba saldría verde sin probar nada.
--
--   posición                 role        type        agencia       ve   internos_ajenos
--   superadmin               superadmin  agente      —             13   11   ✓ plataforma
--   admin Border             admin       agente      Border        13    0   ✓ los 11 son suyos
--   admin Wanderlust         admin       agente      Wanderlust     2    0   ✓ suyo + 1 publicado
--   agente libre             user        agente      —             13   11   ✓ por diseño
--   proveedor Wanderlust     user        proveedor   Wanderlust     2    0   ✓
--   embajador                user        embajador   —              2    0   ✓ (antes 13)
--   viajero                  user        viajero     —              2    0   ✓ (antes 13)
--   anónimo                  —           —           —              2    —   ✓ vitrina
--
-- Sin regresión: `list_public_services`, `get_public_service`,
-- `list_public_suppliers` y `get_service_reviews` siguen sirviendo anónimos (son
-- SECURITY DEFINER, no dependen de la policy); /explora, /servicio/[id] y
-- /agencias responden 200 en producción. `verificar_invariantes` 0,
-- advisors 0 ERROR.
--
-- Pendiente menor, pre-existente y sin riesgo: `/servicios` no filtra por
-- agencia, así que un admin ve ahí el servicio PUBLICADO de la otra agencia.
-- Es dato público y de sólo lectura (`services_update` sigue acotada a
-- `supplier_id = my_supplier_id()`); si molesta, es un filtro de UI.

create or replace function ketzal.is_free_agent()
returns boolean
language sql
stable
security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select exists (
    select 1 from ketzal.profiles
     where id = auth.uid()
       and type = 'agente'
       and supplier_id is null
       and active
  );
$$;

revoke all on function ketzal.is_free_agent() from public;
grant execute on function ketzal.is_free_agent() to anon, authenticated, service_role;

drop policy services_read on ketzal.services;

create policy services_read on ketzal.services
for select
using (
  published
  or ketzal.is_superadmin()
  or supplier_id = ketzal.my_supplier_id()
  or ketzal.is_free_agent()
);
