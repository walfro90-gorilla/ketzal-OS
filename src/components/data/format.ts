// Formateadores de presentación compartidos (dinero y fechas). Puro, sin JSX
// ni código de servidor: se importa desde Server y Client Components por igual.
// Vive en components/data para no acoplar el resto de la app a la carpeta de
// ventas (antes se importaba cross-feature desde (ops)/ventas/ui).

export const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

/** Sin centavos ("$2,399"): para titulares, previews sociales e imágenes OG. */
export const mxnEntero = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Formatea una fecha `date` (YYYY-MM-DD) sin corrimiento por zona horaria. */
export function formatTravelDate(date: string | null): string {
  if (!date) return '—'
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return dateFormatter.format(parsed)
}

/** "Creel, Chihuahua" desde ciudad/estado destino; si faltan, el texto libre `location`. */
export function destino(s: {
  city_to: string | null
  state_to: string | null
  location?: string | null
}): string | null {
  const partes = [s.city_to, s.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : (s.location ?? null)
}

const fechaHoraFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Formatea un timestamp ISO (con `conHora`, también la hora). Vivía dentro de
 * `usuarios-list.tsx`, que es `'use client'`, y el expediente —Server
 * Component— la importaba y la LLAMABA: al abrirlo por navegación cliente Next
 * tiraba 500 ("Attempted to call fmtFecha() from the server but fmtFecha is on
 * the client"). La carga directa sí funcionaba, así que se veía como "la página
 * no existe". b093.
 */
export function fmtFecha(d: string | null | undefined, conHora = false): string {
  if (!d) return '—'
  const p = new Date(d)
  if (Number.isNaN(p.getTime())) return d
  return (conHora ? fechaHoraFormatter : dateFormatter).format(p)
}
