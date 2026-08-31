-- m009 — el panel del god admin muestra la FOTO del viajero, no solo su inicial
--
-- `/dashboard` estrena un carrusel de "últimos viajeros" para el superadmin.
-- La foto vive en `profiles.image`, pero la RLS de `profiles` es solo-propio
-- incluso para él (medido: `select count(*) from profiles` como superadmin
-- devuelve 1, la suya), así que la única vía es el RPC DEFINER que ya usa
-- /viajeros. Solo le falta la llave.
--
-- Cambio mínimo y aditivo: una llave `image` más en el jsonb. Los consumidores
-- leen por nombre de llave, así que /viajeros no se entera. El gate
-- `is_superadmin()` no se toca — sigue siendo la única puerta.
--
-- Re-aplicada desde el DDL vivo (`pg_get_functiondef`), no desde una copia
-- vieja: la función es compartida y otro carril pudo haberla tocado.

create or replace function ketzal.list_travelers()
returns jsonb
language plpgsql
security definer
set search_path to 'ketzal', 'pg_temp'
as $function$
declare v jsonb;
begin
  if not ketzal.is_superadmin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          m.id,
    'full_name',   m.name,
    'email',       m.email,
    'phone',       m.phone,
    'image',       m.image,
    'created_at',  m.created_at,
    'num_compras', (select count(*) from ketzal.bookings b
                     where b.marketplace_customer_id = m.id)
  ) order by m.created_at desc), '[]'::jsonb) into v
  from ketzal.profiles m
  where m.type = 'viajero';

  return v;
end $function$;
