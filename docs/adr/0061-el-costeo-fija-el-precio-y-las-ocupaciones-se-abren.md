# ADR-0061 — El costeo fija el precio de venta y crea las opciones; las ocupaciones se abren a cabañas y camping

- **Estado:** aceptada
- **Fecha:** 2026-09-08
- **Migración:** `b101_packs_cabanas_camping_y_costeo_precio` (CHECK de packs con
  9 ocupaciones; `valid_costing` acepta `precio_venta`, `imprevistos_pct`,
  `portal`)
- **Sustituye a:** ninguno. Amplía [ADR-0055](0055-el-costeo-es-un-plan-no-un-ledger.md)
  (el costeo sigue siendo un plan, no un ledger).
- **Toca:** `src/lib/domain/packs.ts` (5 ocupaciones nuevas) ·
  `src/lib/domain/costeo.ts` (imprevistos, precio de venta, utilidad neta,
  redondeo comercial, `resumen`, `filasPrecio`) · `/servicios/[id]/costeo`
  (cabecera, costo propio, resultado, opciones de precio) ·
  `mcp/src/tools/{catalogo,proveedores}.ts` (mismas ocupaciones)
- **Relacionadas:** [ADR-0055](0055-el-costeo-es-un-plan-no-un-ledger.md),
  [ADR-0005](0005-dinero-derivado.md) (el precio público sigue derivándose del
  pack más barato, b046), [ADR-0016](0016-pagos-solo-mp.md) (la comisión del
  portal vive en `app_settings`)

## Contexto

El primer costeo real (Dunas Mágicas Samalayuca: quinta + sprinter, cupo 45)
llegaba a "Costo por pax $512.50" y ahí se quedaba: **punto de equilibrio y
utilidad salían vacíos** porque el servicio no tiene packs y el único precio
que el costeo conocía era el de los packs. El margen objetivo ya producía un
precio sugerido, pero no se mostraba sin packs, y no había manera de crear las
opciones de precio desde ahí.

Al mismo tiempo, el primer proveedor de hospedaje rústico (Cabañas Rancho San
Lorenzo) vende **unidades de 4, 8 y 10 personas y camping por vehículo de hasta
5**. Las cuatro ocupaciones de hotel (sencilla…cuádruple) no lo decían.

Y todo costo tenía que venir de un tarifario: gasolina, casetas, propinas o un
colchón para lo que sale mal no tenían dónde vivir.

## Decisión

1. **El precio con que se evalúa el plan es el que la persona teclea o, si no,
   el sugerido por el margen.** `precio_venta` (nullable) en la cabecera del
   costeo. Con eso equilibrio, utilidad a los pasajeros plan y utilidad con el
   cupo lleno salen desde el primer costo, haya packs o no.
2. **El precio sugerido tiene redondeo comercial, siempre hacia arriba:** a
   partir de $1,000 termina en 99 (2,714 → 2,799, como los precios reales de
   las agencias); abajo, en 9 (732 → 739). Nunca por debajo del margen.
3. **Imprevistos %** en la cabecera, default 5, sobre TODO el costo.
4. **Utilidad neta si se vende por el portal:** interruptor `portal`; la
   comisión de Ketzal (`app_settings.platform_commission_rate`) sale del
   ingreso. Las comisiones de agente y embajador **no** se descuentan aquí:
   dependen de reglas por servicio y se pagan del margen (ADR-0021/0029).
5. **Costo propio sin proveedor:** una línea del costeo cuya `supplier_id` es
   la agencia dueña y `supplier_name = 'Costo propio'`. Mismo modelo de línea;
   ningún cambio de esquema.
6. **Las opciones de precio se crean o reponen desde el costeo.** Una fila por
   ocupación del catálogo con costo, sugerido, precio actual y **propuesto**
   (el tecleado si no hay hospedaje, el sugerido si lo hay); casillas para
   elegir cuáles y un botón con confirmación que escribe `services.packs` con
   la acción que ya existía (`setServicioPacks`). El precio público sigue
   siendo el pack más barato (b046).
7. **Nueve ocupaciones:** sencilla, doble, triple, cuádruple, **cabaña 6, 8 y
   10, camping 2 y 4**. Mismo modelo (precio por persona por unidad de N):
   `OCCUPANCY` decide cuántos pasajeros suma cada una en la venta manual y
   cómo se reparte la habitación en el costeo. Sin opción "general por
   persona": los tours sin hotel siguen poniendo el mismo precio en varias
   ocupaciones, como Brasil y Colombia hoy.

## Alternativas descartadas

- **Un pack "General (por persona)"** para tours sin hotel. Toca checkout,
  venta manual, cotizaciones y el CHECK; el mismo precio repetido en las
  ocupaciones ya resuelve el caso y es lo que las agencias hacen.
- **Descontar comisiones de agente/embajador en el costeo.** Dependen de la
  regla del servicio y de quién vende; mezclarlas aquí haría mentir al número
  cuando cambia el vendedor. Se muestran donde se pagan.
- **Imprevistos como línea manual.** Un % en la cabecera escala con el costo
  y no se olvida; una línea fija se queda chica cuando el grupo crece.
- **Redondear al peso.** Un precio de $3,688 no es un precio: nadie lo pone
  en un volante.

## Verificación

- `src/lib/domain/costeo.test.ts` (39 casos): imprevistos escalan todo el
  costo; redondeo comercial (2,714 → 2,799; 2,799 se queda; 732.14 → 739;
  0 → 0); el sugerido respeta el margen y termina en 99; `precio_venta` manda
  sobre el sugerido; `portal` descuenta la comisión (3,000 · 16 · 10 % =
  4,800) y sin portal no; `resumen` da plan y lleno con el mismo precio, el
  equilibrio sube con portal y es `null` cuando ni lleno cubre; `filasPrecio`
  da 9 filas, el tecleado aplica a todas sin hospedaje y NO pisa con hospedaje;
  `limpiarCosteo` pone defaults (5 %, sin precio, sin portal) y acota rangos.
- `src/lib/domain/packs.test.ts`: `OCCUPANCY` y `PACK_TYPES` van a la par con
  las 9 claves; las nuevas entran al limpiar y se ordenan después de las
  clásicas.
- `supabase/tests/costeo.sql` (33 aserciones): `cabana8`/`camping4` entran en
  `cost_by_pack`; `imprevistos_pct` 150 y `precio_venta` negativo se
  rechazan.
- `mcp/src/tools/catalogo.test.ts`: el mensaje de pack inválido lista las 9.
- **Pantalla:** `costeo_pagina.mjs` sigue en verde con la app construida; el
  flujo "Crear opciones de precio" en Dunas se prueba con sesión real.
