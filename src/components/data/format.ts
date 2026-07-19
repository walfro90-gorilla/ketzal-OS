// Formateadores de presentación compartidos (dinero y fechas). Puro, sin JSX
// ni código de servidor: se importa desde Server y Client Components por igual.
// Vive en components/data para no acoplar el resto de la app a la carpeta de
// ventas (antes se importaba cross-feature desde (ops)/ventas/ui).

export const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

/** Formatea una fecha `date` (YYYY-MM-DD) sin corrimiento por zona horaria. */
export function formatTravelDate(date: string | null): string {
  if (!date) return '—'
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return dateFormatter.format(parsed)
}
