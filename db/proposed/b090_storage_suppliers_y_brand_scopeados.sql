-- b090 — La auditoría posterior a b088 encontró dos huecos EN b088 mismo.
--
-- b088 scopeó `services/` (dueño del servicio) y `profiles/` (dueño del perfil),
-- pero dejó dos ramas del CASE abiertas a CUALQUIER usuario con agencia:
--
--   suppliers/  →  coalesce(my_supplier_id() is not null or is_superadmin(), false)
--   brand/      →  coalesce(my_supplier_id() is not null or is_superadmin(), false)
--
-- Ninguna de las dos compara la CARPETA con quien escribe. Medido en la BD real
-- (transacción revertida), un agente de una agencia consigue:
--
--   sobrescribir el logo VIVO de la plataforma (brand/logo-1784587723992.png) → 1 fila
--   sobrescribir imagen viva de OTRA agencia  (suppliers/3083d4da…/foto-…jpg) → 1 fila
--
-- Y la ruta es pública: `get_brand_logo()` y `list_public_suppliers()` son
-- ejecutables por `anon` y devuelven las URLs exactas, así que el atacante no
-- adivina el nombre del objeto: se lo dan. Con `upsert: true` en las subidas del
-- navegador, sobrescribir es la operación normal, no un truco.
--
-- Impacto: defacement cruzado entre agencias y del logo de Ketzal. No hay fuga
-- de datos, pero rompe el aislamiento por `supplier_id` de la regla de oro 1.
--
-- Arreglo: la policy deja de inventar su propio criterio y REUSA el mismo que ya
-- gobierna la fila (`suppliers_update`): superadmin, admin de esa agencia, o
-- admin de la agencia dueña del proveedor. `brand/` es de plataforma: superadmin.

begin;

-- Guard con la misma regla que `suppliers_update`. Toma `text` a propósito: la
-- carpeta puede no ser un uuid válido y un cast en la policy reventaría la
-- escritura entera en vez de negarla.
create or replace function ketzal.puedo_escribir_imagen_supplier(p_supplier text)
returns boolean
language sql
stable
security definer
set search_path to 'ketzal', 'pg_temp'
as $$
  select coalesce(ketzal.is_superadmin(), false)
      or coalesce((
           select ketzal.is_agency_admin(s.id)
               or (s.owner_supplier_id is not null and ketzal.is_agency_admin(s.owner_supplier_id))
             from ketzal.suppliers s
            where s.id::text = p_supplier
         ), false);
$$;

revoke execute on function ketzal.puedo_escribir_imagen_supplier(text) from anon;

-- Las dos policies del bucket público se re-aplican enteras (INSERT y UPDATE
-- comparten el mismo CASE; si divergen, una de las dos deja de proteger).
drop policy if exists ketzal_assets_auth_insert on storage.objects;
drop policy if exists ketzal_assets_auth_update on storage.objects;

create policy ketzal_assets_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ketzal-assets'
    and case (storage.foldername(objects.name))[1]
      when 'services' then exists (
        select 1 from ketzal.services s
         where s.id::text = (storage.foldername(objects.name))[2]
           and (s.supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin()))
      when 'suppliers' then ketzal.puedo_escribir_imagen_supplier((storage.foldername(objects.name))[2])
      when 'brand'     then coalesce(ketzal.is_superadmin(), false)
      when 'profiles'  then (storage.foldername(objects.name))[2] = auth.uid()::text
      else false
    end
  );

create policy ketzal_assets_auth_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ketzal-assets'
    and case (storage.foldername(objects.name))[1]
      when 'services' then exists (
        select 1 from ketzal.services s
         where s.id::text = (storage.foldername(objects.name))[2]
           and (s.supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin()))
      when 'suppliers' then ketzal.puedo_escribir_imagen_supplier((storage.foldername(objects.name))[2])
      when 'brand'     then coalesce(ketzal.is_superadmin(), false)
      when 'profiles'  then (storage.foldername(objects.name))[2] = auth.uid()::text
      else false
    end
  )
  with check (
    bucket_id = 'ketzal-assets'
    and case (storage.foldername(objects.name))[1]
      when 'services' then exists (
        select 1 from ketzal.services s
         where s.id::text = (storage.foldername(objects.name))[2]
           and (s.supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin()))
      when 'suppliers' then ketzal.puedo_escribir_imagen_supplier((storage.foldername(objects.name))[2])
      when 'brand'     then coalesce(ketzal.is_superadmin(), false)
      when 'profiles'  then (storage.foldername(objects.name))[2] = auth.uid()::text
      else false
    end
  );

-- Higiene del linter: las dos únicas funciones que quedaban sin search_path fijo.
-- Son INVOKER y devuelven una constante (no resuelven ningún nombre), así que no
-- hay escalación posible; se fijan para que el advisor quede en cero.
alter function ketzal.bono_reclutador_monto() set search_path to 'ketzal', 'pg_temp';
alter function ketzal.bono_reclutador_venta_minima() set search_path to 'ketzal', 'pg_temp';

commit;
