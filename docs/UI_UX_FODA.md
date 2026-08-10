# FODA de UI/UX — Ketzal OS

> 2026-07-19 · Rama `claude/ui-ux-improvements-nacxmh`, previo a su PR.
> Complementa el `FODA.md` general (negocio) con un corte específico de la capa
> de presentación. Evidencia: auditoría de las 28 rutas de la app (3 barridos:
> pantallas ops, superficies públicas, shell/sistema) contra `UI_UX_PLAN.md` §2
> (principios) y `BRAND.md`. Cada hallazgo se citó con `archivo:línea` al
> momento de la auditoría.

## Contexto

La rama ya traía 4 mejoras (fix del `<option>` en dark, lada internacional,
dashboard con gráficas + filtro de fechas, buscador de clientes). Antes del PR
se auditó TODA la superficie para decidir con evidencia qué más entra en este
ciclo y qué queda como deuda explícita.

---

## FODA

### Fortalezas (internas)

- **El sistema responde a una tesis clara y está construido sobre ella.**
  Campo-primero de verdad: escala táctil 44px→36px en primitivos (`input.tsx`,
  `button.tsx` con `size="touch"`), `text-base` móvil anti-zoom iOS, bottom
  tabs con `safe-area-inset`, y `DataList` que colapsa tablas a tarjetas — una
  sola definición de columnas para las 10 listas.
- **Navegación íntegra.** `nav-items.ts` cubre las 12 rutas ops 1:1 (cero
  huérfanas), sidebar y tabs consumen la misma fuente, filtro por rol.
- **A11y por encima del promedio.** Skip link, `aria-current`, `aria-sort`,
  `aria-live` en conteos, combobox/listbox ARIA completos (⌘K y buscador de
  clientes), `prefers-reduced-motion` global, focus rings consistentes.
- **Documentos públicos con plomería seria.** Sistema OG unificado de marca
  con fallback elegante (nunca imagen rota), metadatos completos para WhatsApp,
  fail-closed en tokens inválidos con copy claro, recibo con calidad de
  imprenta (papel forzado blanco, cantidad con letra, `break-inside-avoid`).
- **Dark mode por tokens OKLCH bien cableado** (class + system), con fixes
  finos (`color-scheme`, `<option>` nativo).
- **Feedback visible**: toasts en flujos que permanecen en página, confirmación
  de dos pasos en destructivos (sin `confirm()` del navegador).

### Debilidades (internas — con evidencia)

- ~~**Imprimir cotización/estado con dark mode = PDF ilegible.**~~ ✅ corregido
  en esta rama (ver plan). El navegador omite fondos al imprimir y el texto
  quedaba casi blanco sobre papel. Era el P0: el PDF es EL entregable de venta.
- ~~**El primitivo por patrón, incumplido justo donde el plan lo pedía.**~~ ✅
  `selectClass` estaba copiado en 9 archivos (3 con la versión obsoleta de 32px
  que rompía el mínimo táctil y provocaba zoom iOS en servicios/proveedores/
  equipo), `textareaClass` en 5, el header de página en ~20, y `ui/select.tsx`
  muerto. Consolidado: `NativeSelect`, `Textarea`, `PageHeader`, `Badge
  success`.
- ~~**Documentos compartibles sin familia visual.**~~ ✅ la cotización (el
  documento del momento de decisión) no mostraba logo ni acento de marca, el
  recibo tenía "← Volver" a una ruta con login, y "Compartir por WhatsApp"
  solo existía en el recibo. Unificado (header teal + logo + share + pie).
- **Detalle de venta con 3 tablas de scroll horizontal** (líneas, abonos,
  plan) — la pantalla más usada en campo. Migración a tarjetas móviles
  pendiente para el próximo ciclo (ver plan).
- **`mxn`/`StatusBadge`/`formatTravelDate` siguen en `(ops)/ventas/ui.tsx`** e
  importados cross-feature (`cobranza`, `dashboard`, `reportes`…). El plan §4
  los quiere en `components/data/`. Mecánico pero ruidoso: próximo ciclo.
- **Skeleton único con forma de lista** para rutas que no son lista (dashboard,
  detalle, formularios): fidelidad baja al hidratar. Las rutas públicas ya
  tienen el suyo (esta rama); las ops bespoke quedan pendientes.
- **⌘K solo busca clientes/ventas/servicios**; cotizaciones, proveedores y
  cobranza no. Y `comisiones`/`cobranza` no tienen búsqueda en sus listas.
- **Dos patrones de éxito en formularios** (toast vs "Guardado ✓" inline).
  Aceptable, pero es una decisión pendiente de unificar.
- **Ficha pública de servicio sin OG de respaldo** cuando no hay banner (la
  convención de archivo pisaría al banner real; requiere ruta OG condicional).
- **Historial en `clientes/[id]` aún es tabla cruda** (4 col con scroll).

### Oportunidades (externas)

- **El logo real** (BRAND.md lo pide al diseñador): con `brand-icon.tsx` +
  `BrandMark` como únicos puntos de verdad, un swap propaga a favicon, PWA,
  OG, header, auth y documentos. Máximo lift de percepción por esfuerzo mínimo.
- **La familia visual de documentos como diferenciador.** La competencia
  (agencias informales) cierra ventas con capturas y notas de voz; una
  cotización/estado/recibo con la misma cara profesional construye la
  confianza que el marketplace 🅰️ va a necesitar.
- **PWA con shortcuts** ("Nueva venta", "Cobranza") — hábito de app nativa en
  el teléfono del agente sin costo de tienda.
- **La vitrina B2C hereda el sistema.** Todo primitivo consolidado hoy
  (PageHeader, NativeSelect, Combobox, gráficas SVG) es costo marginal ~cero
  para la fase marketplace.
- **⌘K ampliable** a cotizaciones/cobranza: el agente resolvería "¿dónde está
  la venta de Fulano?" sin navegar.

### Amenazas (externas)

- **El contexto de uso real es hostil**: 3G en carretera, navegador in-app de
  WhatsApp, sol directo, una mano. Cada kilobyte de JS y cada control <44px
  cobra ahí. Antídoto vigente: SVG server-rendered, primitivos táctiles,
  skeletons.
- **Dark mode del sistema del cliente final** en documentos que terminan en
  papel/PDF: ya mordió una vez (P0 de impresión). Regla nueva: todo documento
  imprimible se diseña "papel-primero".
- **Deriva multi-agente.** El `selectClass` obsoleto reapareció DESPUÉS de
  existir el primitivo; con 2+ agentes editando en paralelo, la duplicación
  regresa sola. Antídoto: los primitivos compartidos de esta rama + revisar en
  PR cualquier string de clases repetido.
- **Crecimiento de datos.** Listas que hoy son cortas (clientes QA) serán
  cientos de filas; los patrones con tope + búsqueda (Combobox limit 50,
  FilterableList) deben ser el default de toda lista nueva.

---

## Plan de acción

### Aplicado (ciclo 7 — galería, video y orden en el catálogo público)

| # | Acción | Estado |
|---|---|---|
| C7-1 | **Galería (hasta 20 fotos) + carrusel.** El form de servicio permite subir varias fotos (grid con quitar) además del banner; en la ficha `/servicio/[id]` se muestran en un carrusel ligero sin dependencias (banner + `imgAlbum`, flechas/puntos/miniaturas). Acción `setServicioAlbum` (mismo gate anti-SSRF que el banner, cap 20, merge no destructivo). Sin cambios de BD (imgAlbum ya viajaba en `images`). Subida directa a Storage (multi) | ✅ |
| C7-2 | **Video opcional (YouTube/Vimeo).** Campo de link en el form (`setServicioVideo`) + embed responsivo (`youtube-nocookie`) en la ficha. Validador/normalizador único `lib/video.ts` (valida al guardar y arma el embed; rechaza no-videos y `javascript:`). Requirió extender `get_public_service` con `yt_link` (migración `ketzal_get_public_service_ytlink`, snapshot re-sincronizado) | ✅ |
| C7-3 | **Pulido de `/explora`.** Orden por nombre / precio ↑ / precio ↓ (en memoria, cliente) sumado a la búsqueda + filtros existentes | ✅ |

> Verificado: `tsc`/`build` limpios; escritura→lectura de album+video contra la BD viva en TX con rollback (RPC devuelve `imgAlbum` y `yt_link`); parser de video probado en 7 casos. Nota de prod: el fundador ya subió **banners reales** a Brasil y Dunas con el ciclo 6 — el flujo de subida funciona en producción.

### Aplicado (ciclo 6 — imagen del servicio para el catálogo público)

| # | Acción | Estado |
|---|---|---|
| C6-1 | **Subida del banner del servicio.** Cierra el hueco que dejó publicar: los servicios vivos no tenían foto y el form no dejaba subir una. Tarjeta **Imágenes** en `servicio-form.tsx` (modo edición): preview + subir/cambiar/quitar. La subida es **directa del navegador al bucket público `gorilla-assets`** (`subir-banner.ts`, browser client) para esquivar el tope de 4.5 MB de los server actions; la URL se guarda con la acción nueva `setServicioImagen` (RLS solo-dueño, merge no destructivo de `images`). Enciende de un tiro la ficha (`images.imgBanner`), el catálogo (`list_public_services.image`) y el OG. **Sin policies nuevas** (el bucket ya permite insert autenticado + lectura pública). Verificado escritura→lectura en TX con rollback | ✅ |

### Aplicado (ciclo 5 — publicar servicio desde el formulario)

| # | Acción | Estado |
|---|---|---|
| C5-1 | **Toggle publicar/privado en el formulario de servicio.** El agente ya no depende de la lista para publicar: `servicio-form.tsx` (modo edición) tiene una tarjeta **Publicación** con un interruptor que prende/apaga el catálogo público al instante (reusa la acción `setServicioPublicado` ya existente → toast + reversión optimista si falla). Nuevo primitivo `Switch` (base-nova sobre `@base-ui/react/switch`, tokens de marca, táctil). Al **crear** el interruptor queda deshabilitado con la nota de que se publica una vez guardado (aún no hay `id`). `[id]/page.tsx` pasa `published` al form (cast, columna no tipada). **Sin cambios de backend** | ✅ |

### Aplicado (ciclo 4 — con visto bueno para cruzar a backend)

| # | Acción | Estado |
|---|---|---|
| C4-1 | **⌘K ampliado** a **cotizaciones** (bookings `draft`) y **proveedores** (`suppliers`), además de clientes/ventas/servicios. Requirió extender el RPC `ketzal.global_search` (migración `ketzal_global_search_cotizaciones_proveedores`, `SECURITY INVOKER` → RLS intacta, solo-lectura) + cablear los 2 grupos nuevos en `global-search.tsx`. Snapshot de schema re-sincronizado. Verificado contra la BD viva (búsqueda de proveedor devuelve href correcto) | ✅ |

### Aplicado (ciclo 3 — tras integrar `services/new` del otro agente)

| # | Acción | Estado |
|---|---|---|
| C3-1 | `money`/`fechas` → `components/data/format.ts` y `StatusBadge`/`BookingStatus` → `components/data/status-badge.tsx`. Los 17 importadores migrados; `ventas/ui.tsx` queda solo con las etiquetas de dominio (item/passenger). Mata los imports cross-feature de `ventas/ui` (§4 del plan) | ✅ |
| C3-2 | Feedback de éxito de formularios unificado a `toast` (sonner): los 7 forms con "Guardado ✓" inline (cliente, proveedor, servicio, tasa comisión, tasa plataforma, miembro, vencimiento) ahora usan `toast.success`, sin estado `saved`/`setTimeout` | ✅ |
| C3-3 | OG condicional de `servicio/[id]`: `opengraph-image.tsx` usa el banner como foto a sangre (scrim + nombre/destino/precio/marca) si existe, y cae a la tarjeta de marca si no — siempre hay preview al compartir. `generateMetadata` deja de fijar `images` (lo provee el archivo) | ✅ |

### Aplicado (ciclo 2 — segunda pasada)

| # | Acción | Estado |
|---|---|---|
| C2-1 | Detalle de venta: las 3 tablas (líneas, plan de pagos, abonos) a `DataList` → tarjetas apiladas en móvil, sin scroll horizontal. Abonos además adopta el `NativeSelect` compartido, badge "Liquidada" a `variant="success"` y botón "Emitir recibo" táctil | ✅ |
| C2-2 | Historial de `clientes/[id]` a `DataList` con `rowHref` (tarjetas en móvil, fila enlaza a la venta) — cierra la deuda de tablas con scroll horizontal | ✅ |
| C2-3 | Búsqueda + orden en `cobranza` (con filtro Atrasadas/Al corriente) y `comisiones` vía `FilterableList` (componentes cliente `cobranza-list`/`comisiones-list`) | ✅ |
| C2-4 | Skeletons bespoke (`components/data/skeletons.tsx` + `loading.tsx` en dashboard/reportes/cobranza/ventas·[id]) → el fallback ya se parece al layout real, sin salto al hidratar | ✅ |
| C2-5 | `Badge variant="warning"` (ámbar): consolida las 3 copias hardcodeadas del string ámbar (StatusBadge `draft`, `equipo-list`, `clawbot-list`) — misma deuda que `success` | ✅ |

### Aplicado (ciclo 1)

| # | Acción | Estado |
|---|---|---|
| P0-1 | `@media print` fuerza tokens claros: cotización/estado imprimibles en dark | ✅ |
| P1-1 | `NativeSelect` compartido (táctil + chevron) y adopción en los 9 usos; muere `selectClass` y el `ui/select.tsx` sin uso | ✅ |
| P1-2 | `PageHeader` compartido y adopción en ~20 pantallas (título/desc/acción/back) | ✅ |
| P1-3 | Familia de marca en documentos: logo+teal en cotización, share WhatsApp en las 3, pie "Powered by Ketzal", fuera el "← Volver" interno del recibo, moneda real en cotización | ✅ |
| P1-4 | Selects de 32px (servicios/proveedores/equipo) a escala táctil; botones de cotizaciones táctiles en móvil | ✅ |
| P2-1 | `Textarea` compartido (5 usos), `Badge variant="success"` (4 hardcodes emerald) | ✅ |
| P2-2 | "Salir" + email en el sheet "Más" móvil (uso a una mano) | ✅ |
| P2-3 | PWA: `theme_color` teal, shortcuts Nueva venta/Cobranza, `id`, `lang` | ✅ |
| P2-4 | Marca en auth, pantallas de token inválido y wordmark del header (`BrandMark`) | ✅ |
| P2-5 | `loading.tsx` en las 4 rutas públicas; OG de `/explora`; CTA de servicio full-width táctil | ✅ |
| P2-6 | `salud`: eventos a `DataList`; EmptyState compartido en comisiones/equipo | ✅ |

### Aplicado (ciclo 8 — logo oficial configurable)

| # | Acción | Estado |
|---|---|---|
| C8-1 | **Logo oficial gestionable desde la app** (destraba el único pendiente del FODA). En vez de un swap a mano del SVG, se hizo un **sistema**: config admin **`/ajustes`** (solo superadmin) para subir/cambiar/quitar el logo → **Storage** (`gorilla-assets/brand/`), URL en **`app_settings.logo_url`**. Lectura vía RPC público `get_brand_logo` (para páginas anónimas). El logo se muestra en el **header de la app** (server, `app-shell`) y en **login** (`BrandLogo` cliente), con **fallback al SVG** si no hay logo. Migración `ketzal_app_settings_logo`; snapshot re-sincronizado; advisors 0 errores | ✅ |

### Aplicado (ciclo 9 — logo en documentos)

| # | Acción | Estado |
|---|---|---|
| C9-1 | **Logo de Ketzal como co-marca en documentos.** Recibo, cotización y estado de cuenta llevan el logo oficial en el pie **"Powered by Ketzal"** (componente `PoweredByKetzal`, server, con fallback al SVG). Decisión de marca del fundador: el logo de la **agencia** sigue siendo el principal (arriba); Ketzal es solo la firma de plataforma. Reusa `getBrandLogo()` (RPC público) | ✅ |

### Aplicado (ciclo 10 — logo en previews OG; favicon se queda con el símbolo)

| # | Acción | Estado |
|---|---|---|
| C10-1 | **Wordmark en el pie de los previews OG** (recibo/cotización/estado/servicio/explora). `og-card` carga el logo oficial (`getBrandLogo` + fetch a data-URI, dimensiones leídas del header PNG porque Satori las exige) y lo pinta en una **pastilla blanca** en el pie —contraste garantizado sobre el fondo teal— en lugar del texto "Powered by Ketzal". Ante cualquier fallo (sin logo, fetch falla, no-PNG) **cae al texto** (nunca imagen rota). Sin `edge` runtime (usa `Buffer`) | ✅ |
| C10-2 | **Favicon/PWA icons se quedan con el quetzal a propósito** (decisión del fundador, opción 2): el logo oficial es un **wordmark**, ilegible en un cuadrado de 16–32px. Cuando exista un **símbolo cuadrado** de la marca se agrega un 2º slot en `/ajustes` y se cablea a favicon/PWA + el cuadrado del OG | ⏸️ (bloqueado por asset) |

> Nota: los OG no se pudieron verificar visualmente desde el entorno (proxy bloquea el host de Storage y no se ven imágenes renderizadas); el fallback a texto hace el cambio seguro, y el fundador confirma compartiendo un link.

### Aplicado (ciclo 11 — corte marketplace, 2026-08-10, worktree `marketplace-ux`)

Auditoría en vivo contra producción real (no solo lectura de código): recorrido
en Chrome de `/explora`, `/servicio/[id]`, `/agencias` con las 2 agencias/3
servicios reales que había en ese momento. FODA completo (con hallazgos)
publicado como artifact visual; resumen aquí.

**Hallazgo P0 (dato, no código):** un listing de QA ("TEST compra Menny", $5,
destino inventado, sin foto) estaba **publicado en producción**, visible a
cualquier visitante. Despublicado (`services.published=false`) con confirmación
del fundador — decisión de negocio, no autónoma.

| # | Acción | Estado |
|---|---|---|
| C11-1 | **Overlay de precio generado por el sistema** en toda tarjeta de `/explora` (scrim + pill sobre la imagen, mismo `Intl.NumberFormat` que el texto de abajo). Antes el único precio "grande" visible dependía de que la agencia lo quemara en su flyer — con formato propio, inconsistente y sin garantía de estar sincronizado con el precio real | ✅ |
| C11-2 | **Normalización de títulos en MAYÚSCULAS** para mostrar (`lib/display-title.ts`, `tituloVisible`): si el nombre del servicio viene todo en mayúsculas se muestra en Capitalizado; si ya viene normal, se respeta tal cual. Aplicado en la tarjeta de `/explora` y el `<h1>` de la ficha — **metadata/SEO se deja intacta** (título crudo del agente) | ✅ |
| C11-3 | **Placeholder de marca** (`BrandMark` + degradado jade, componente ya existente reusado) para servicios sin foto: reemplaza el pin genérico en la tarjeta del catálogo, y cierra un hueco no detectado antes — la ficha (`carrusel.tsx`) renderizaba **nada** (`return null`) sin fotos, un hueco visual real en la pantalla de venta | ✅ |
| C11-4 | **Tarjeta CTA "¿Tienes una agencia?"** en el directorio `/agencias` (dashed border, icono +, enlaza a `/login` como el footer). Con 2 agencias el grid se sentía vacío/pobre; ahora la escasez es un gancho de conversión, no un vacío | ✅ |

> Verificado en vivo (`pnpm dev`, no solo build): catálogo bajó de 3 a 2 viajes
> tras despublicar el TEST; overlay de precio consistente en ambas tarjetas;
> "MAZATLAN NEW YEAR EN AVION" se ve "Mazatlan New Year En Avion" en tarjeta y
> ficha (metadata/tab title sigue crudo); CTA de `/agencias` renderiza
> correctamente. `tsc`+`build`+`vitest` (75) limpios.

### Aplicado (ciclo 12 — Cuentas/Gastos/Salidas/Comisiones, 2026-08-10, worktree `ops-polish`)

Repaso de las 4 secciones señaladas en el ciclo 11 contra los primitivos de
ciclos 1–10. Veredicto: **la mayoría ya estaba alineada** (`PageHeader`,
`EmptyState`, `DataList`, toasts) — construir sobre esos primitivos sí se
volvió el default, incluso en carriles de backend. Lo que sí quedó de la
"deriva multi-agente" que el ciclo 1 ya advertía:

| # | Acción | Estado |
|---|---|---|
| C12-1 | **`/salidas/[id]`: tabla cruda de 5 columnas → `DataList`.** Era el único `<table>` real fuera de documentos imprimibles en las 4 secciones — en móvil obligaba a scroll horizontal para leer quién vendió qué (viola el principio #4 del plan). Mismo comportamiento (link solo en ventas propias, reventas de otra agencia sin link) | ✅ |
| C12-2 | **`window.prompt()` → formulario inline** en "Revertir gasto" (`/gastos`, `BotonRevertir`). El motivo del reverso se pedía con el prompt nativo del navegador — feo, no estilizado, mal en móvil. Ahora expande un `Textarea` + Confirmar/Cancelar en la misma fila, reusando el primitivo ya consolidado en ciclo 1 | ✅ |
| C12-3 | **`window.confirm()` → confirmación inline** en "Liquidar" (`/cuentas`, `LiquidarBoton`, superadmin). Mismo patrón: click revela el monto a confirmar + Confirmar/Cancelar en línea, sin diálogo nativo del navegador | ✅ |
| — | **Comisiones**: sin hallazgos — ya usa `PageHeader`/`EmptyState`, sin tablas crudas ni diálogos nativos | ✅ (sin cambios) |

> Nota de método: no se pudo hacer el recorrido visual autenticado (Cuentas/
> Gastos/Salidas requieren login de agente/superadmin, a diferencia de la
> vitrina pública del ciclo 11) — verificado por `tsc`+`build`+`vitest` (75) y
> reutilizando al pie de la letra primitivos ya probados visualmente en
> ciclos anteriores (`DataList`, `Textarea`, variantes de `Button`), no
> CSS/markup nuevo. Pendiente: un vistazo del fundador en `/salidas/[id]`,
> `/gastos` y `/cuentas` para confirmar a ojo.

### Pendiente

1. **Símbolo cuadrado de marca** → favicon/PWA + cuadrado del OG (bloqueado:
   falta el asset del ícono aislado, sin la palabra "Ketzal").
2. **Filtros de `/explora` a un Sheet en móvil** — 5 controles en una fila es
   denso en pantalla chica (P2 del corte marketplace, ciclo 11).
3. **Barrido de `window.confirm`/`window.prompt` fuera de estas 4 secciones**
   (ej. `spei-pendientes.tsx` en `/cobranza` usa `window.confirm` para
   aprobar/rechazar transferencias) — mismo antipatrón, fuera del alcance de
   este ciclo (acotado a Cuentas/Gastos/Salidas/Comisiones).

> El ⌘K se cerró en C4-1. La "cobranza" no se agregó al ⌘K a propósito — no es
> una entidad buscable (vista derivada de las ventas con saldo); buscar el
> cliente ya lleva a su venta, que enlaza a cobranza.

## Verificación de este ciclo

`tsc` + `next build` limpios tras cada ola; render real en Chromium (claro,
oscuro, móvil 390px) de dashboard, combobox y documentos públicos; la
impresión se verificó emulando `print` con dark mode activo (texto oscuro
sobre blanco). Detalle por commit en el historial de la rama.

### Cierre de testing — publicación de servicios (2026-07-20)

El fundador publicó **2 servicios reales** con el toggle nuevo; verificado
end-to-end contra la BD viva (`ketzal`, proyecto Gorilla-Labs):

- **Escritura del toggle:** `services.published = true` en *Brasil* y *Dunas
  Mágicas Samalayuca 2026* (marcados 2026-07-20 13:32–13:33). El interruptor
  persiste correctamente.
- **Catálogo público** (`ketzal.list_public_services`): devuelve **exactamente
  esos 2** y nada más.
- **Ficha pública** (`ketzal.get_public_service`): el publicado devuelve datos;
  un servicio **privado** y un **uuid inexistente** devuelven `null`
  (fail-closed, como diseñado).
- **Advisors de seguridad:** **0 errores** (78 lints, todos WARN/INFO de
  baseline preexistente; el ciclo no introdujo DDL). Sin regresión.

Testing cerrado. El catálogo público queda **en fase de pruebas con 2
servicios vivos** (aún no operación real).
