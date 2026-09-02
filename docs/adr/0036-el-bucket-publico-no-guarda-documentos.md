# ADR-0036 — Un bucket público no guarda documentos, y ninguna policy scopea solo por bucket

- **Fecha:** 2026-09-02
- **Estado:** aceptada
- **Amplía:** [ADR-0004](0004-tenancy-rls-por-agencia.md) ·
  [ADR-0007](0007-folios-atomicos.md)
- **Contexto de código:** `db/proposed/b088_superficie_publica_storage.sql` ·
  `src/app/api/comprobante/route.ts` ·
  `src/app/comprar/[serviceId]/subir-comprobante.ts`
- **Verificación:** `pnpm hard-test superficie_storage` (15/15) —
  `supabase/tests/superficie_storage.sql` afirma, con `set local role
  authenticated` y claims de una cuenta cualquiera: 0 objetos `spei/` en el
  bucket público, `ketzal-privado.public = false` y 0 policies de SELECT sobre
  él, y cuatro INSERT rechazados (comprobante ajeno, foto de servicio ajeno,
  perfil ajeno, `spei/` en el bucket público) más `update … row_count = 0`.
  Folios: `puede_folear(agencia ajena) = false` y `next_doc_folio` /
  `next_receipt_folio` lanzan. Y tres casos en positivo —el agente dueño sube su
  foto y saca su folio— porque apretar una policy rompe callado.
  `pnpm hard-test superficie_anonima` (33 pruebas, 0 expuestas) añade la mirada
  de caja negra: listar `spei/` y el bucket privado con la publishable key, y un
  GET público **con cache-buster**.

## Contexto

**Barrido de seguridad sobre producción, 2026-09-02.** El bucket
`ketzal-assets` es `public = true` y plano, y sus tres policies scopeaban
únicamente por `bucket_id`. De ahí salieron tres huecos, medidos, no supuestos:

1. **Los comprobantes de transferencia SPEI eran descargables sin sesión.**
   `POST /storage/v1/object/list/ketzal-assets` con la publishable key —que va
   en el bundle por diseño— enumeraba `spei/`, sus 8 carpetas de pedido y los 13
   archivos. El GET público de uno devolvió **200, 137237 bytes, image/jpeg**:
   la foto de la transferencia de un cliente real, con nombre del titular, banco
   y monto. El código apostaba a otra cosa: *«path con aleatorio = no
   adivinable»*. Cierto e irrelevante — no hay que adivinar el path, se lista.
2. **Cualquier autenticado podía sobreescribir cualquier objeto.**
   `ketzal_assets_auth_update` era `USING (bucket_id = 'ketzal-assets')`, sin
   carpeta ni dueño. El registro del marketplace es abierto, así que un viajero
   recién dado de alta podía reemplazar el comprobante de una venta ajena
   —borrar la evidencia de un pago o plantar una falsa—, el logo o las fotos del
   catálogo. `ketzal_assets_auth_insert` era igual de ancha: hosting gratis.
3. **`next_doc_folio` / `next_receipt_folio`: `SECURITY DEFINER`, sin un solo
   guard, con `p_supplier` libre.** Los `supplier_id` son públicos vía
   `services`, así que cualquier cuenta podía quemar en bucle la serie de folios
   de una agencia real y abrirle huecos a su numeración (ADR-0007).

El detalle que decide el diseño: en un bucket con `public = true`, la ruta
`/object/public/…` **no evalúa RLS**. Acotar la policy de SELECT habría cerrado
el listado y dejado la descarga abierta. Un documento no se protege quedándose
en un bucket público con mejores policies; se protege saliendo de ahí.

## Decisión

1. **Los documentos con datos de una persona viven en `ketzal-privado`**
   (`public = false`, sin ninguna policy de SELECT). Se leen sólo por URL
   firmada desde el server. `ketzal-assets` se queda con lo que se sirve por
   CDN a propósito: catálogo, logos, fotos de perfil.
2. **La lectura hereda el guard que ya existe, no inventa uno.**
   `/api/comprobante?intent=<uuid>` lee `payment_intents` con el cliente **del
   usuario**: decide `payment_intents_sel`. Si la RLS no te lo muestra,
   responde 404 — sin confirmar ni negar que el intent exista.
3. **Ninguna policy de storage scopea sólo por `bucket_id`.** Cada una decide
   por la primera carpeta del path y por quién eres: el servicio pertenece a tu
   agencia, el perfil es el tuyo, el pedido es tuyo
   (`ketzal.puedo_subir_comprobante`).
4. **Un comprobante no se sobreescribe.** `upsert: false` en la subida y ninguna
   policy de UPDATE en el bucket privado: es evidencia de un pago.
5. **El contador de folios es de la agencia.** El guard va **dentro** de
   `next_doc_folio` / `next_receipt_folio` (`ketzal.puede_folear`), no en cada
   llamador: `emit_receipt`, `emit_voucher` y `create_booking_with_items` son
   INVOKER y los llaman con el JWT del agente, así que revocar el EXECUTE
   rompería la operación real sin cerrar nada que el guard no cierre.

## Consecuencias

- Un `<img src>` directo al comprobante ya no funciona: Cobranza pasa por
  `/api/comprobante`. Los `receipt_url` viejos guardan la URL pública completa
  del bucket anterior; la ruta extrae el path de ambas formas, así que no hubo
  que migrar datos.
- Los 13 comprobantes y `presentacion-cierre.pdf` se movieron con la API de
  Storage. **El CDN siguió sirviendo su copia cacheada** (`cf-cache-status: HIT`,
  `max-age=3600`) hasta una hora después: con cache-buster el mismo path ya
  daba 400. Cualquier hard-test de storage tiene que llevar cache-buster o
  miente en verde.
- Dos bugs del propio fix los cazó el harness antes de mergear, y los dos son de
  familia conocida:
  - dentro del `exists (… from ketzal.services s …)` un `name` pelón resuelve a
    `services.name`, no a `objects.name` — la policy le pasaba el nombre del
    servicio a `storage.foldername()` y el agente dueño no podía subir su foto;
  - `puede_folear` devolvía **NULL** (no false) para quien no es de ninguna
    agencia, y `if not NULL then raise` no entra: el folio se consumía igual.
    Es el guard sin `coalesce(…, false)` de la regla de oro 1 (ADR-0004),
    cobrando por tercera vez.
- Techo aceptado: `suppliers/` y `brand/` scopean a «eres agente de alguna
  agencia», no a la agencia dueña — `suppliers` no tiene columna de tenancy y
  `brand/` es un path plano. Baja el universo de «cualquier registrado» a
  «agentes»; se aprieta cuando `suppliers` gane dueño.
- El mismo barrido cerró, sin decisión estructural que documentar: cabeceras de
  seguridad (`frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`) y `poweredByHeader: false`; `search_path` fijo en
  `my_supplier_id()`; `EXECUTE` de `refund_payment` y `ensure_statement_token`
  revocado a `anon`; y un tope por IP en `/api/track`, que escribía con service
  role sin límite. La CSP completa (con nonce, en Report-Only primero) queda
  pendiente.
