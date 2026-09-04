// Clases de los CTAs de la home (ADR-0046). Módulo hoja sin React: lo importan
// la landing y /styleguide. Un solo primario por vista; pill SOLO aquí.
// Focus visible sobre canvas: anillo jade con offset del mismo canvas.
const FOCO =
  'outline-none focus-visible:ring-2 focus-visible:ring-jade-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

/** Pill jade-600 con texto canvas (8.66:1). Altura 48 px ≥ target táctil. */
export const CTA_PRIMARIO = `inline-flex h-12 items-center justify-center rounded-pill bg-jade-600 px-6 text-body font-semibold text-canvas transition-colors hover:bg-jade-500 ${FOCO}`

/** Hairline sobre canvas; misma altura que el primario para alinear en fila. */
export const CTA_SECUNDARIO = `inline-flex h-12 items-center justify-center rounded-card border border-hairline-strong px-6 text-body text-hi transition-colors hover:border-hi/40 ${FOCO}`

/** Versión compacta del primario para la nav (40 px, sigue ≥ 44 con su padding vertical de zona). */
export const CTA_NAV = `inline-flex h-10 items-center justify-center rounded-pill bg-jade-600 px-4 text-small font-semibold text-canvas transition-colors hover:bg-jade-500 ${FOCO}`

/** Enlace de texto discreto (nav, "Entrar"). */
export const ENLACE = `inline-flex min-h-11 items-center px-2 text-small text-mid transition-colors hover:text-hi ${FOCO} rounded-card`
