import Link from 'next/link'
import { ShoppingBagIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { mxn } from '@/components/data/format'

// Compras de un viajero (bookings ligados por marketplace_customer_id). Server
// component de solo lectura; el dinero (cobrado/saldo) viene derivado del RPC
// list_traveler_purchases. Cada fila enlaza al detalle de la venta.

export type Compra = {
  id: string
  folio: string | null
  service: string | null
  agency: string | null
  travel_date: string | null
  status: string
  total: number
  cobrado: number
  saldo: number
  created_at: string
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-muted text-muted-foreground' },
  reserved: { label: 'Reservada', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  confirmed: { label: 'Confirmada', cls: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' },
  paid: { label: 'Pagada', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-destructive/10 text-destructive' },
}

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const fmtFecha = (d: string | null) => {
  if (!d) return '—'
  const p = new Date(d.length <= 10 ? `${d}T12:00:00` : d)
  return Number.isNaN(p.getTime()) ? d : fecha.format(p)
}

const columns: DataColumn<Compra>[] = [
  {
    header: 'Servicio',
    primary: true,
    cell: (c) => (
      <Link href={`/ventas/${c.id}`} className="flex flex-col hover:underline">
        <span>{c.service ?? 'Servicio'}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {c.agency ?? '—'}
          {c.folio ? ` · ${c.folio}` : ''}
        </span>
      </Link>
    ),
  },
  {
    header: 'Fecha viaje',
    cell: (c) => <span className="whitespace-nowrap">{fmtFecha(c.travel_date)}</span>,
  },
  {
    header: 'Total',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{mxn.format(Number(c.total))}</span>,
  },
  {
    header: 'Cobrado',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{mxn.format(Number(c.cobrado))}</span>,
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (c) => (
      <span
        className={`font-semibold tabular-nums ${
          Number(c.saldo) > 0 ? 'text-amber-700 dark:text-amber-400' : ''
        }`}
      >
        {mxn.format(Number(c.saldo))}
      </span>
    ),
  },
  {
    header: 'Estado',
    cell: (c) => {
      const e = ESTADO[c.status] ?? { label: c.status, cls: 'bg-muted text-muted-foreground' }
      return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>
          {e.label}
        </span>
      )
    },
  },
]

export function ViajeroCompras({ rows }: { rows: Compra[] }) {
  return (
    <DataList
      columns={columns}
      rows={rows}
      getRowKey={(c) => c.id}
      empty={
        <EmptyState
          icon={ShoppingBagIcon}
          title="Aún no tiene compras"
          description="Cuando este viajero haga un pedido en el marketplace aparecerá aquí."
        />
      }
    />
  )
}
