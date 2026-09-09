# ADR-0063 — El perfil social del viajero se ve solo entre compañeros de viaje

- Estado: aceptada · Fecha: 2026-09-09 · Sustituye: —
- Alcance: `ketzal.profiles` (`nickname`, `dream_trip`, `bio`, `city`, `is_public`,
  `social_photo_path`), `ketzal.profile_reports`, RPCs `update_my_traveler_profile`,
  `co_travelers`, `report_traveler`, `list_profile_reports`; policy de storage
  `ketzal_privado_profiles_insert`; `src/app/(travel)/perfil/**`,
  `src/app/(travel)/mis-compras/[bookingId]/co-pasajeros*`.
- Implementado en: **b104** (campos + opt-in), **b106** (foto gateada), **b107**
  (proyección + reportes). PRs #189, #191 y el de esta ADR.
- Relacionadas: [ADR-0004](0004-tenancy-rls-por-agencia.md) (tenancy por agencia —
  este es OTRO eje), [ADR-0036](0036-el-bucket-publico-no-guarda-documentos.md)
  (bucket privado + URL firmada), [ADR-0037](0037-el-admin-de-agencia-ve-a-sus-embajadores.md)
  (un guard niega con excepción, no con lista vacía), [ADR-0002](0002-estrategia-dos-tiempos.md)
  (el alcance v1 dejaba fuera lo social; esto es una rebanada mínima con propósito).

## Contexto

El fundador quiere que cada viajero tenga un perfil "tipo RRSS" (foto, apodo,
viaje soñado…) visible **para quienes viajan en el mismo tour**. Tres hechos
acotan el diseño:

1. `profiles` guarda en la misma fila datos sensibles (`email`, `phone`, `role`,
   `supplier_id`, `referral_code`, `must_change_password`). Un `select` para
   mostrarle un perfil a otro viajero filtraría PII — la familia de bug
   RLS/PostgREST que ya nos pegó varias veces.
2. La seguridad del OS es por `supplier_id` (ADR-0004). "Mismo tour" es un **eje
   nuevo**: viajero↔viajero por salida compartida (`service_id` + `travel_date`;
   no hay FK booking→departure).
3. Mostrar cara y nombre a desconocidos es un paso de privacidad, y desconocidos
   + foto + texto libre es riesgo de acoso o contenido inapropiado.

Decisiones del fundador (2026-09-09): opt-in **apagado** por default, foto
**gateada**, los viajeros **solo se ven** (sin contacto entre ellos), y
reportar/ocultar incluido desde el arranque.

## Decisión

1. **Proyección, no tabla.** Otro viajero nunca lee `profiles`. `co_travelers(p_booking)`
   (DEFINER) devuelve exactamente `{id, nickname, city, dream_trip, bio, photo_path}`.
   Ni `email`, ni `phone`, ni `name`. `id` va porque hace falta para reportar; no es
   dato de contacto.
2. **Gate por salida compartida y pedido activo.** El que pregunta debe ser dueño
   (`marketplace_customer_id = auth.uid()`) de un pedido `reserved|confirmed|paid`;
   se listan los otros dueños de pedidos activos con el mismo `service_id` +
   `travel_date`, con `is_public = true` y `active`, excluyendo al que pregunta y a
   quien él reportó. Borradores y otras fechas no cuentan. Un pedido ajeno **niega
   con excepción** (ADR-0037); `[]` solo cuando de verdad no hay nadie público.
3. **Opt-in apagado.** `is_public` default `false`; se prende desde `/perfil` con
   copy que dice qué se muestra y qué no (nombre completo y teléfono, nunca).
4. **Foto gateada.** `social_photo_path` es una **ruta** (no URL) en `ketzal-privado`;
   la policy de INSERT solo deja subir a `profiles/<uid>/`; el RPC valida que la ruta
   sea de la propia carpeta; se sirve **firmada desde el servidor** (service client),
   y solo se firma una ruta con forma `profiles/<uuid>/<archivo>`. Las fotos de
   logos/servicios/embajador siguen en el bucket público: son otra cosa.
5. **Reportar = ocultar + revisar.** `report_traveler` exige compartir salida; un
   reporte oculta al reportado **para quien reporta** (efecto inmediato, sin
   moderación previa) y queda en `profile_reports` (deny-all; solo por RPC) para que
   el superadmin lo revise con `list_profile_reports`. La pantalla de revisión es
   fast-follow; los datos ya están.
6. **Sin contacto entre viajeros.** Ni teléfono, ni mensajes, ni "seguir". Eso es
   🅰️ completo y queda fuera.

## Verificación (ADR-0034)

- `supabase/tests/co_pasajeros.sql` — 14 aserciones, `pnpm hard-test co_pasajeros`:
  sin sesión niega (1); A ve solo a B (2); las llaves son exactamente las sociales y
  no hay `email`/`phone`/`name` (3, 3b, 3c); ni yo, ni privada, ni otra fecha, ni
  borrador (4); pedido ajeno niega con excepción (5); reportarse a sí mismo y a
  quien no viaja contigo se rechaza (6a, 6b); reportar oculta (7); un viajero no
  lista reportes (8); el reporte de A no oculta a A para B (9); otra fecha no ve
  a nadie de la salida (10); el superadmin ve el reporte (11).
- **Mutación**: al quitar el filtro `is_public` de `co_travelers` (dentro de una
  transacción revertida), la aserción 4 se pone roja — el harness no es decoración.
- b106 en vivo (rollback): la ruta propia se guarda; la de otro revienta
  `"La foto debe subirse a tu propio perfil"`.
- b104 en vivo (rollback): un viajero edita sus campos; un agente queda intacto.

## Alternativas descartadas

- **Foto en el bucket público** (como logos): más simple, pero cualquiera con la URL
  la ve, y el fundador pidió gateada.
- **Visible por default**: adopción más rápida, pero publica cara y apodo de gente
  que no lo pidió. Opt-in.
- **Una view con RLS** en vez de RPC: RLS es por fila y la columna sensible viaja
  igual; la proyección DEFINER controla las columnas.
- **Moderación previa** (aprobar cada perfil): no escala para el fundador-operador;
  reportar+ocultar da control inmediato y deja rastro.

## Pendiente

Pantalla de revisión de reportes para el superadmin (los datos ya salen de
`list_profile_reports`). Limpieza de fotos huérfanas en el bucket privado (cada
subida crea un objeto nuevo; el path viejo queda sin referencia).
