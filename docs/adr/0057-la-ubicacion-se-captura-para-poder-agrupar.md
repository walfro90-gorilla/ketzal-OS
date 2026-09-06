# ADR-0057 — La ubicación se captura para poder agrupar: país y estado cerrados, ciudad sugerida; y el correo del proveedor es opcional

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** `b098_ubicacion_estructurada_y_contacto`
- **Sustituye a:** ninguno
- **Toca:** `suppliers.city/state/country` y `contact_email` (ahora nulable) ·
  `services.country_from/country_to` · `src/lib/domain/mexico.ts` (nuevo) ·
  `src/components/data/campos-ubicacion.tsx` (nuevo) · formulario de proveedores
- **Relacionadas:** [ADR-0056](0056-quien-vende-es-dueno-de-sus-servicios.md)
  (el tipo es etiqueta, la relación manda),
  [ADR-0051](0051-una-pagina-por-destino-generada-del-catalogo.md) (las páginas
  por destino agrupan por ciudad)

## Contexto

Al registrar la quinta de Samalayuca el fundador pidió que ciudad, estado y país
dejaran de ser texto libre, para poder agrupar después. Midiendo antes de
diseñar aparecieron dos problemas, uno peor que el otro:

**El campo de estado guardaba países.** `services.state_to` era texto libre y no
existía columna de país, así que convivían "Jalisco", "Sinaloa" y "San Luis
Potosí" con **"Colombia", "Brasil", "Perú" y "Costa Rica"**. Cualquier reporte
por estado mezclaba entidades con países, y en pantalla no se veía raro porque
"Medellín, Colombia" se lee bien.

**`contact_email` era `NOT NULL`**, y hay proveedores informales que solo tienen
WhatsApp. No se podía registrar la quinta sin inventarle un correo, y un correo
inventado para pasar una validación es peor que un campo vacío: ensucia el dato
y nadie sabe que es falso.

## Decisión

**Cerrado donde el conjunto es cerrado, sugerido donde es abierto.**

1. **País: lista cerrada** (`PAISES`). Cambian cada década; si falta uno, se
   agrega al catálogo en una línea.
2. **Estado: lista cerrada de las 32 entidades**, y **solo si el país es
   México**. Fuera de México el campo se oculta: "Antioquia" no aporta aquí, y
   ese hueco era justo por donde se colaban los países.
3. **Ciudad: texto con sugerencias** de las ya capturadas. Son infinitas, así
   que se guía en vez de bloquear. Que dos personas escriban distinto no rompe
   la agrupación: se normaliza con `claveLugar()`, el mismo criterio de
   `slugDestino()`.
4. **`address` se queda solo para la calle.** Antes cargaba con todo.
5. **El correo del proveedor es opcional, pero el contacto no.** Se exige al
   menos uno de los dos —correo o teléfono— y la regla vive **en la base**
   (`suppliers_contacto_chk`), no solo en el formulario. El `UNIQUE` de
   `contact_email` sigue valiendo: Postgres permite varios `NULL`.

## Consecuencias

- Se puede agrupar por estado o por país sin mezclar unidades.
- Registrar un proveedor informal ya no obliga a inventar un correo.
- Un proveedor sin ningún contacto deja de ser posible, que es el riesgo que
  abre volver opcional el correo.
- El backfill movió los cuatro países fuera de `state_to` y marcó `México` en
  los que tenían estado mexicano, así que no hay que tratar el `NULL` como caso
  especial al agrupar por país.
- **Pendiente:** el formulario de servicios todavía captura estado y ciudad como
  texto libre. Las columnas de país ya existen; falta llevarle
  `CamposUbicacion`, que es el mismo componente. Mientras tanto la regresión
  está cubierta por el harness.

## Alternativas descartadas

- **Tabla de ciudades con llave foránea.** Las ciudades son abiertas y el
  catálogo se volvería una tarea de mantenimiento para nadie. Sobre-ingeniería
  para un problema que la normalización resuelve.
- **Dejar el estado como texto libre y limpiar después.** Es lo que ya se hizo
  sin querer, y el resultado fue países dentro del campo de estado.
- **Un país como texto libre con sugerencias.** Los países sí son un conjunto
  cerrado; abrirlo solo invita a "Mexico", "MX" y "México" como tres valores.
- **Hacer también el teléfono obligatorio.** Habría bloqueado a los proveedores
  que solo dan correo. La regla correcta es "al menos uno", no "los dos".

## Verificación

- `src/lib/domain/mexico.test.ts` (12 casos): las 32 entidades sin repetidos;
  `claveLugar` agrupa "Mazatlán" con "MAZATLAN" y "San Luis Potosí" con
  " san luis potosi "; **`estadoCanonico('Colombia')` es `null`** —la afirmación
  que nombra el bug original—; `etiquetaLugar` usa el estado dentro de México y
  el **país** fuera, y no repite cuando ciudad y estado se llaman igual.
- `supabase/tests/ubicacion_contacto.sql` (`pnpm hard-test ubicacion_contacto`,
  8 aserciones, fixtures propias y revertidas): un proveedor con **solo
  teléfono** se guarda; sin correo **ni** teléfono no se guarda; una cadena
  vacía no cuenta como contacto; dos proveedores sin correo conviven pese al
  `UNIQUE`; el servicio guarda el país en su columna y deja el estado libre; y
  **ningún servicio real tiene un país en `state_to`**, que es la regresión del
  bug que motivó todo.
