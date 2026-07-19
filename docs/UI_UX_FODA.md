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

### Aplicado (ciclo 3 — tras integrar `services/new` del otro agente)

| # | Acción | Estado |
|---|---|---|
| C3-1 | `money`/`fechas` → `components/data/format.ts` y `StatusBadge`/`BookingStatus` → `components/data/status-badge.tsx`. Los 17 importadores migrados; `ventas/ui.tsx` queda solo con las etiquetas de dominio (item/passenger). Mata los imports cross-feature de `ventas/ui` (§4 del plan) | ✅ |

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

### Pendiente (próximo ciclo — en orden)

1. **⌘K ampliado** a cotizaciones/proveedores/cobranza — requiere ampliar el
   RPC `global_search` (capa backend): coordinar con el agente de backend.
4. **Unificar el patrón de éxito** de formularios (decidir toast vs inline).
5. **OG condicional para ficha de servicio sin banner** (ojo: la convención
   `opengraph-image.tsx` pisa el banner real; debe usar el banner si existe y
   solo caer al card de marca si no — no romper el caso con banner).
6. **Logo real** → swap en `brand-icon.tsx`/`BrandMark` (bloqueado por diseño).

## Verificación de este ciclo

`tsc` + `next build` limpios tras cada ola; render real en Chromium (claro,
oscuro, móvil 390px) de dashboard, combobox y documentos públicos; la
impresión se verificó emulando `print` con dark mode activo (texto oscuro
sobre blanco). Detalle por commit en el historial de la rama.
