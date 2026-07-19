// Helpers de presentación compartidos por las pantallas de Ventas
// (lista, nueva venta y detalle). Sin código de servidor: se puede
// importar tanto desde Server Components como desde Client Components.
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/db/database.types'

export type BookingStatus = Database['ketzal']['Enums']['booking_status']

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

export const ITEM_TYPE_LABELS: Record<string, string> = {
  passenger: 'Pasajero',
  room: 'Habitación',
  addon: 'Add-on',
  custom: 'Personalizado',
}

export const PASSENGER_TYPE_LABELS: Record<string, string> = {
  adult: 'Adulto',
  child: 'Niño',
  inapam: 'INAPAM',
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'Cotización',
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
}

const STATUS_BADGE: Record<
  BookingStatus,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'
    className?: string
  }
> = {
  draft: {
    variant: 'outline',
    className:
      'border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  reserved: { variant: 'secondary' },
  confirmed: { variant: 'default' },
  paid: { variant: 'success' },
  cancelled: { variant: 'destructive' },
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_BADGE[status] ?? { variant: 'outline' as const }
  return (
    <Badge variant={config.variant} className={config.className}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
