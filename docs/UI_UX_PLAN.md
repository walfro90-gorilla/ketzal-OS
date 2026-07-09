# Ketzal OS — Plan de UI/UX (mobile-first, campo-primero)

> Documento vivo. Owner: **agente UI/UX**. Coordina con el agente de backend (ver §7).
> Contexto de producto en `../CLAUDE.md`. Este doc sólo cubre presentación, shell y componentes.

## 1. Decisiones bloqueadas

| Decisión | Elección | Consecuencia de diseño |
|---|---|---|
| **Dispositivo principal** | **Campo-primero (teléfono).** El agente vende con el teléfono en la mano. | Optimizamos touch y uso a una mano al máximo. El desktop es un *enhancement*, no el caso base. |
| **Navegación móvil** | **Bottom tab bar** (tipo app nativa, alcanzable con el pulgar). | Shell con barra inferior en móvil + sidebar en desktop. `env(safe-area-inset-bottom)` obligatorio. |

## 2. Principios (no negociables para esta capa)

1. **Diseñar el móvil primero, el desktop es el `md:` que se añade.** Nunca "encoger el escritorio".
2. **Blanco de toque mínimo 44×44px** en cualquier control que un dedo toque. `base-nova` viene calibrado para mouse (32px); lo corregimos.
3. **Uso a una mano:** acciones primarias al alcance del pulgar (mitad inferior). Nada crítico pegado arriba.
4. **Sin scroll horizontal para leer datos.** Tabla de >3 columnas ⇒ tarjetas apiladas en móvil.
5. **Nunca pantalla en blanco.** Toda ruta con datos tiene skeleton (`loading.tsx`).
6. **Feedback siempre visible.** Éxito y error se comunican (toast), no en silencio.
7. **Un solo primitivo por patrón.** Si dos pantallas necesitan lo mismo, va a `components/`. Cero copy-paste (hoy: `selectClass`, el header, el patrón de tabla).
8. **Progressive enhancement.** Funciona sin JS donde se pueda (forms server-action); JS mejora, no habilita.

## 3. Sistema de diseño — ajustes base

Mantenemos Tailwind v4 + tokens OKLCH + shadcn `base-nova`. Cambios:

### 3.1 Escala de tamaños táctiles
`base-nova` es denso (Button `h-8`=32px, Input `h-8`=32px). Regla: **controles cómodos en móvil, compactos en desktop** vía clases responsive.

- **Input**: `h-11 md:h-9` (44px→36px). Mantener `text-base md:text-sm` (16px en móvil evita el zoom de iOS).
- **Button default**: `h-10 md:h-8`. Añadir `size="touch"` (`h-11`) para acciones primarias de formulario en móvil.
- **Select nativo**: mismo sizing; encapsular en componente (ver 3.2).
- `size="xs"`/`sm` quedan reservados para controles **secundarios de desktop** (p.ej. celdas densas), nunca para la acción principal de una pantalla.

### 3.2 Componentes shadcn a añadir
- `Select` — reemplaza el `<select>` + `selectClass` duplicado (`nueva-venta-form.tsx:51`).
- `Sheet` — drawer del "Más" del tab bar y overlays móviles.
- `Sonner` (toast) — feedback de éxito/error global.
- `Skeleton` — estados de carga.
- `DropdownMenu` — menú de avatar/perfil en el header.
- `Separator`, `Avatar` — utilitarios del shell.

### 3.3 Meta / plataforma
- `export const viewport` en root: `themeColor`, `viewportFit: 'cover'`, `maximumScale` sin bloquear zoom accesible.
- `manifest.ts` (PWA) para "Agregar a inicio" — un agente de campo quiere el ícono en su home.
- Dark mode: tokens ya existen; falta el toggle y aplicar `.dark`. Va en Fase 3.

## 4. Arquitectura de componentes objetivo

```
components/
  ui/                     # shadcn base (existente + nuevos de 3.2)
  shell/
    app-shell.tsx         # layout: sidebar desktop / bottom-tabs móvil
    bottom-tabs.tsx       # tab bar móvil, aria-current, safe-area
    nav-items.ts          # fuente única de rutas (label, href, icon)
    user-menu.tsx         # avatar + email colapsado + salir
  data/
    data-list.tsx         # tabla en md+ / tarjetas en móvil, 1 def de columnas
    page-header.tsx       # título + acción, responsive
    empty-state.tsx       # icono + texto + CTA
    money.tsx / status    # mover mxn/StatusBadge de ventas/ui.tsx a compartido
```

**Rutas del tab bar (campo-primero):** `Panel · Ventas · Clientes · Cotizaciones · Más`.
El "Más" abre un `Sheet` con: Comisiones, Servicios, Proveedores, perfil y Salir.

## 5. Plan por fases

### Fase 0 — Fundamentos (invisible, desbloquea todo) ✅ HECHA (2026-07-09)
- [x] `viewport` + `themeColor` + `viewportFit:'cover'` en `app/layout.tsx`.
- [x] Escala táctil en `ui/button.tsx` (`h-10 md:h-8`, size `touch`/`icon-touch`) e `ui/input.tsx` (`h-11 md:h-9`).
- [x] Instalados shadcn: select, sheet, dropdown-menu, separator, skeleton, sonner. `sonner.tsx` desacoplado de `next-themes` (se reconecta en Fase 3).
- [ ] ~~Extraer `mxn`/`formatTravelDate`/`StatusBadge`~~ → **diferido a Fase 2** (se hace cuando el `DataList` los necesite; evita churn con el backend ahora).
- **Verificación:** reglas CSS confirmadas (`.h-11`=44px, `.h-10`=40px, `.md:h-9`=36px); typecheck verde; dashboard sin regresión en desktop.

### Fase 1 — Shell responsive ✅ HECHA (2026-07-09)
- [x] `components/shell/`: `nav-items.ts` (fuente única) + `sidebar-nav` + `bottom-tabs` (con sheet "Más" + safe-area) + `user-menu` + `app-shell`.
- [x] `(ops)/layout.tsx` reescrito sobre `AppShell` (conserva el fetch de user/profile): sidebar `hidden md:block`, bottom tabs `md:hidden`, `aria-current` en la ruta activa.
- [x] `UserMenu` (avatar → dropdown con nombre/email + Salir vía `requestSubmit`); el header ya no desborda el email.
- [x] `<main>` con `p-4 pb-24 md:p-6` (libera espacio para la bottom bar).
- **Verificación:** desktop OK por screenshot (sidebar con íconos + activo, avatar); bottom bar validada por DOM (5 tabs, `aria-current`, `md:hidden`).
- **⚠️ Gotcha base-ui encontrado y corregido:** su `DropdownMenuLabel` es `Menu.GroupLabel` y **exige** un `<Menu.Group>` padre; usado suelto tira todo el árbol. Regla: para bloques de texto informativos en un menú usar un `<div>`, no `DropdownMenuLabel`. (base-ui ≠ radix en varias partes; leer el componente generado antes de usarlo.)

### Fase 2 — Datos responsive ✅ HECHA (2026-07-09)
- [x] `components/data/data-list.tsx` — `DataList<T>` (1 def de columnas ⇒ tabla `md+` / tarjetas `<md`; `rowHref` hace la tarjeta/nombre un link; `fullWidthOnCard` para columnas de acciones).
- [x] `components/data/list-skeleton.tsx` + `(ops)/loading.tsx` (skeleton genérico; el shell queda intacto durante la carga).
- [x] **Editor de líneas rediseñado** (`nueva-venta-form.tsx`): móvil = **una tarjeta por línea** (Tipo/Subtipo, Descripción, Cant.+P.unitario, Importe, borrar 44px); desktop = la tabla compacta de siempre. Lógica intacta. `NativeSelect` con chevron, `inputMode` móviles, botones apilados full-width.
- [x] **Todas las listas migradas a `DataList`:** ventas, dashboard (Por cobrar + Próximos viajes, preservando vencido/vence del backend), clientes, cotizaciones (acciones full-width, sin rowHref), servicios, proveedores, comisiones (Comisiones ganadas), equipo (miembros, acciones full-width). **Cero `import` de `Table` en páginas de lista.**
- **Verificación:** typecheck verde; las 7 rutas compilan (307, no 500). Visual de tarjetas móviles: pendiente de eyeball autenticado (post-push).

### Fase 3 — Pulido ✅ HECHA (2026-07-09)
- [x] **Dark mode**: `app/providers.tsx` (next-themes, `attribute="class"`, `defaultTheme=system`) + `ThemeToggle` en el header (claro/oscuro/sistema) + `suppressHydrationWarning`. **Verificado en vivo:** `.dark` aplica/quita bien, fondo negro↔blanco, sin errores.
- [x] **Toasts (`Sonner`)** — cableados end-to-end:
  - `Toaster` en el root (reconectado a next-themes).
  - **Éxito tras redirect:** instrumenté los 7 redirects de las actions con `?ok=<código>` (venta, cotización, cliente, servicio ±eliminado, proveedor ±eliminado) → `FlashToasts` (shell) muestra el toast y limpia el param. **Actions eran del backend pero estaban limpias; edité solo la línea del redirect con comentario.**
  - **Éxito en flujos que se quedan en la página:** `toast.success` en abono/reembolso, emitir recibo, convertir cotización.
  - **Error:** `toast.error` en crear venta y convertir cotización.
  - **Contrato para el backend:** al agregar acciones nuevas que redirigen, añadir `?ok=<código>` (y el mensaje en `flash-toasts.tsx`); las que se quedan, `toast.success` directo.
- [x] **`EmptyState` con CTA** (icono + texto + botón) en ventas, clientes, cotizaciones, servicios, proveedores.
- [x] **PWA instalable** (adelantada a pedido): `app/manifest.ts` (standalone, start_url `/dashboard`) + íconos generados con `next/og` (`/icons/192·512·maskable`, `app/apple-icon.tsx`, `app/icon.tsx`) — **sin dependencias ni assets binarios**. Mark placeholder (hoja/pluma esmeralda) swappable por el logo real. Verificado por curl: manifest válido, PNGs correctos (192×192, etc.), `<link rel=manifest>` + `apple-touch-icon` en el HTML.
  - **⚠️ Tocado del backend:** `src/proxy.ts` — extendí el `matcher` para que `/manifest.webmanifest` y `/icons/*` sean públicos (sin sesión no eran instalables). Cambio mínimo de una línea.
- [x] **Microinteracciones + accesibilidad:** `prefers-reduced-motion` global (globals.css); **skip link** "Saltar al contenido" + `<main id="contenido" tabIndex=-1>`; anillos `focus-visible` en sidebar, bottom tabs y tarjetas del `DataList` (navegación por teclado); `transition-colors`/`active:` ya presentes.
- **Criterio de aceptación:** ✅ cada acción confirma resultado (toasts); estados vacíos invitan a la acción; instalable en home; navegable por teclado con foco visible.

## 6. Fuera de alcance (para no expandir sin acuerdo)
Animaciones elaboradas, ilustraciones custom, rediseño de marca/paleta, i18n más allá de es-MX, offline-first real (sync). Se evalúan después de Fase 3.

## 7. Coordinación con el agente de backend
- **Yo (UI/UX) soy dueño de:** `components/ui`, `components/shell`, `components/data`, `app/layout.tsx`, `(ops)/layout.tsx`, `globals.css`, y la capa presentacional (`*-form.tsx`, `page.tsx` en su JSX).
- **Backend es dueño de:** `actions.ts`, `lib/`, tipos, queries Supabase y la lógica de dominio.
- **Contrato:** cuando backend scaffoldea una página nueva, la envuelve en `PageHeader` + `DataList`/`Card` y usa los `ui/*` existentes ⇒ hereda mobile-correcto gratis. Si necesita un patrón nuevo, lo pide aquí y lo vuelvo primitivo.
- **Riesgo activo:** `(ops)/layout.tsx` está modificado y `servicios/` sin trackear en el árbol de trabajo. Antes de Fase 1 sincronizo para no pisar su trabajo.

## 8. Riesgos
1. **Editor de líneas en móvil** (Fase 2) es el trabajo de verdad; el resto es mecánico. No subestimarlo.
2. **Colisión de archivos** con el agente de backend en `layout.tsx` / páginas → mitigado por §7.
3. **Regresión de densidad en desktop** al subir touch targets → mitigado con clases responsive (`h-11 md:h-9`), no con un solo tamaño grande.
