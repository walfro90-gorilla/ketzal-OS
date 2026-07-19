// Estado de una venta como Badge de marca. Compartido por todas las pantallas
// (ventas, dashboard, cobranza, comisiones, clientes); vive en components/data
// para no acoplarlas a la carpeta de ventas. Sin código de servidor.
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/db/database.types'

export type BookingStatus = Database['ketzal']['Enums']['booking_status']

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
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'success'
      | 'warning'
    className?: string
  }
> = {
  draft: { variant: 'warning' },
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
