-- b088 · La superficie pública se cierra a lo que de verdad es público.
--
-- (Se aplicó a la BD en cuatro pasos llamados `b087_a..d` antes de notar que
-- b087 ya era la conversión viajero→embajador de ADR-0033. El contenido es
-- este archivo; el número bueno es b088.)
--
-- Barrido de seguridad del 2026-09-02 sobre https://ketzal-os.vercel.app.
-- Tres huecos, todos por la misma causa: el bucket `ketzal-assets` es público y
-- plano, y sus policies scopean SOLO por `bucket_id`.
--
--   1. CRÍTICO — los comprobantes de transferencia SPEI (`spei/{booking}/…`)
--      eran descargables por cualquiera sin sesión. `POST /storage/v1/object/
--      list/ketzal-assets` con la publishable key enumeraba las 13 fotos; el
--      GET público devolvía 200 / 137237 bytes. Nombre del titular, banco y
--      monto de clientes reales, en internet abierto. El comentario del código
--      («path con aleatorio = no adivinable») era falso: no hay que adivinarlo,
--      se lista. Y como el bucket es `public=true`, `/object/public/…` ni pasa
--      por RLS: acotar la policy de SELECT no habría bastado. El comprobante se
--      va a un bucket PRIVADO y se sirve firmado.
--   2. ALTO — `ketzal_assets_auth_update` dejaba a CUALQUIER autenticado
--      sobreescribir CUALQUIER objeto. El registro del marketplace es abierto:
--      un viajero podía reemplazar el comprobante de una venta ajena (borrar la
--      evidencia de un pago o plantar una falsa), el logo o las fotos del
--      catálogo. Ahora insert/update van scopeados por carpeta y por dueño.
--   3. MEDIO — `next_doc_folio`/`next_receipt_folio` son DEFINER sin un solo
--      guard y con `p_supplier` libre. Los supplier_id son públicos vía
--      `services`, así que cualquier cuenta podía quemar en bucle los folios de
--      una agencia real y abrir huecos en la serie (ADR-0007).
--
-- Cierra también: `my_supplier_id()` sin `search_path` (es el guard de casi
-- toda la RLS) y dos EXECUTE de más al rol `anon`.

begin;

-- ── 1. Bucket privado para documentos de pago ────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ketzal-privado', 'ketzal-privado', false, 8388608,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

-- El dueño del pedido puede subir SU comprobante. Va en una función DEFINER
-- porque la policy no puede consultar `bookings` directo: la RLS de bookings no
-- incluye al comprador del marketplace (ve su pedido por RPC, no por tabla), así
-- que un `exists` plano daría false y rompería la subida. El criterio es el
-- mismo que ya usa `submit_spei_payment`: marketplace_customer_id = auth.uid().
create or replace function ketzal.puedo_subir_comprobante(p_booking uuid)
returns boolean language sql stable security definer
set search_path to 'ketzal', 'pg_temp' as $$
  select coalesce((
    select b.marketplace_customer_id = auth.uid()
      from ketzal.bookings b
     where b.id = p_booking and b.status <> 'cancelled'
  ), false);
$$;
revoke execute on function ketzal.puedo_subir_comprobante(uuid) from public;
grant execute on function ketzal.puedo_subir_comprobante(uuid) to authenticated;

drop policy if exists ketzal_privado_spei_insert on storage.objects;
create policy ketzal_privado_spei_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ketzal-privado'
    and (storage.foldername(objects.name))[1] = 'spei'
    and ketzal.puedo_subir_comprobante(((storage.foldername(objects.name))[2])::uuid)
  );

-- Sin policy de SELECT/UPDATE/DELETE a propósito: el comprobante se lee sólo
-- por URL firmada desde el server (`/api/comprobante`, que revalida con la RLS
-- de payment_intents) y no se sobreescribe nunca — es evidencia de un pago.

-- ── 2. El bucket público deja de ser tierra de nadie ─────────────────────
-- La lectura pública se queda como está: lo que vive aquí es catálogo y marca,
-- destinado a servirse por CDN. Lo que se cierra es quién ESCRIBE.
drop policy if exists ketzal_assets_auth_insert on storage.objects;
drop policy if exists ketzal_assets_auth_update on storage.objects;

-- Ojo con `objects.name` calificado: dentro del `exists` sobre
-- `ketzal.services`, un `name` pelón NO resuelve a la columna de storage sino a
-- `services.name` — la policy le pasaba el nombre del servicio a
-- storage.foldername() y el agente dueño no podía subir su foto.
--
-- ponytail: `suppliers` y `brand` scopean a "eres agente", no a la agencia
-- dueña — `suppliers` no tiene columna de tenancy (su policy es `qual = true`)
-- y `brand/` es un path plano sin agencia. Baja el universo de atacantes de
-- «cualquier registrado» (el marketplace es de registro abierto) a «agentes de
-- alguna agencia». Si algún día `suppliers` gana dueño, este check se aprieta.
create policy ketzal_assets_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ketzal-assets'
    and case (storage.foldername(objects.name))[1]
      when 'services' then exists (
        select 1 from ketzal.services s
         where s.id::text = (storage.foldername(objects.name))[2]
           and (s.supplier_id = ketzal.my_supplier_id() or ketzal.is_superadmin()))
      when 'suppliers' then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
      when 'brand'     then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
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
      when 'suppliers' then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
      when 'brand'     then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
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
      when 'suppliers' then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
      when 'brand'     then coalesce(ketzal.my_supplier_id() is not null or ketzal.is_superadmin(), false)
      when 'profiles'  then (storage.foldername(objects.name))[2] = auth.uid()::text
      else false
    end
  );

-- ── 3. Folios: el contador es de la agencia, no del que llame ────────────
-- No se puede revocar el EXECUTE: `emit_receipt`, `emit_voucher` y
-- `create_booking_with_items` son INVOKER y lo llaman con el JWT del agente.
-- El guard va adentro, que es además donde protege a todos los llamadores.
-- El viajero entra por `emit_my_voucher` (DEFINER) y sólo para la agencia donde
-- tiene una compra — que es un folio que ya podía consumir legítimamente.
-- Quién tiene derecho a consumir un folio de `p_supplier`.
create or replace function ketzal.puede_folear(p_supplier uuid)
returns boolean language sql stable security definer
set search_path to 'ketzal', 'pg_temp' as $$
  -- El coalesce NO es decorativo: `p_supplier = my_supplier_id()` con
  -- my_supplier_id() null da NULL, y `if not NULL then raise` no entra — el
  -- folio se consumía igual. Es el guard sin coalesce de la regla de oro 1
  -- (ADR-0004), y lo cazó `superficie_storage.sql` antes de mergear.
  select coalesce(p_supplier is not null and (
       coalesce(auth.role(), '') = 'service_role'
    or coalesce(ketzal.is_superadmin(), false)
    or p_supplier = ketzal.my_supplier_id()
    or exists (select 1 from ketzal.bookings b
                where b.selling_supplier_id = p_supplier
                  and b.marketplace_customer_id = auth.uid())
  ), false);
$$;

create or replace function ketzal.next_doc_folio(p_supplier uuid, p_series text)
returns bigint language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
declare v bigint;
begin
  if not ketzal.puede_folear(p_supplier) then
    raise exception 'Sin acceso a los folios de esa agencia';
  end if;
  insert into ketzal.doc_counters(supplier_id, series, last_folio)
  values (p_supplier, p_series, 0) on conflict (supplier_id, series) do nothing;
  update ketzal.doc_counters set last_folio = last_folio + 1
   where supplier_id = p_supplier and series = p_series
  returning last_folio into v;
  return v;
end $$;

create or replace function ketzal.next_receipt_folio(p_supplier uuid)
returns bigint language plpgsql security definer
set search_path to 'ketzal', 'pg_temp' as $$
declare v bigint;
begin
  if not ketzal.puede_folear(p_supplier) then
    raise exception 'Sin acceso a los folios de esa agencia';
  end if;
  insert into ketzal.receipt_counters(supplier_id, last_folio)
  values (p_supplier, 0) on conflict (supplier_id) do nothing;
  update ketzal.receipt_counters set last_folio = last_folio + 1
   where supplier_id = p_supplier
  returning last_folio into v;
  return v;
end $$;

-- ── 4. `my_supplier_id()` con search_path fijo ───────────────────────────
-- Es el guard detrás de casi toda la RLS y era la única DEFINER del schema sin
-- `search_path` (lint `function_search_path_mutable`).
alter function ketzal.my_supplier_id() set search_path to 'ketzal', 'pg_temp';

-- ── 5. Dos EXECUTE de más ────────────────────────────────────────────────
-- No eran explotables (una exige auth.uid(), la otra privilegios de UPDATE que
-- anon no tiene) pero el grant no tenía por qué existir.
revoke execute on function ketzal.refund_payment(uuid) from anon;
revoke execute on function ketzal.ensure_statement_token(uuid) from anon;

commit;
