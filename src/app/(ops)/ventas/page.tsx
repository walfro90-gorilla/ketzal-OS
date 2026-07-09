import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { BanknoteIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { formatTravelDate, mxn, StatusBadge, type BookingStatus } from './ui'

type SaleRow = {
  id: string
  folio: string | null
  travel_date: string | null
  total: number
  status: BookingStatus
  customer: { full_name: string } | null
  service: { name: string } | null
}

const columns: DataColumn<SaleRow>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (s) => (
      <>
        {s.customer?.full_name ?? 'Sin cliente'}
        {s.folio && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {s.folio}
          </span>
        )}
      </>
    ),
  },
  { header: 'Servicio', cell: (s) => s.service?.name ?? 'A medida' },
  { header: 'Fecha', cell: (s) => formatTravelDate(s.travel_date) },
  {
    header: 'Total',
    align: 'right',
    cell: (s) => (
      <span className="tabular-nums">{mxn.format(Number(s.total))}</span>
    ),
  },
  { header: 'Estado', cell: (s) => <StatusBadge status={s.status} /> },
]

export default async function VentasPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, folio, travel_date, total, status, customer:customers(full_name), service:services(name)'
    )
    .order('created_at', { ascending: false })

  // Los tipos generados a mano no describen las relaciones (FK), así que la
  // inferencia del select anidado falla: cast estrecho del resultado.
  const sales = (data ?? []) as unknown as SaleRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <Link
          href="/ventas/nueva"
          className={buttonVariants({ variant: 'default' })}
        >
          Nueva venta
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer las ventas: {error.message}
        </p>
      ) : (
        <DataList
          columns={columns}
          rows={sales}
          getRowKey={(s) => s.id}
          rowHref={(s) => `/ventas/${s.id}`}
          empty={
            <EmptyState
              icon={BanknoteIcon}
              title="Aún no hay ventas"
              description="Cierra tu primera venta y aparecerá aquí."
              action={
                <Link
                  href="/ventas/nueva"
                  className={buttonVariants({ variant: 'default' })}
                >
                  Nueva venta
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}
