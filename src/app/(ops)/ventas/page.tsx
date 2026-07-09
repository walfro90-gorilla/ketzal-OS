import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <Link href="/ventas/nueva" className={buttonVariants({ variant: 'default' })}>
          Nueva venta
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer las ventas: {error.message}
        </p>
      ) : sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay ventas. Crea la primera.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>
                  <Link
                    href={`/ventas/${sale.id}`}
                    className="font-medium hover:underline"
                  >
                    {sale.customer?.full_name ?? 'Sin cliente'}
                  </Link>
                  {sale.folio && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {sale.folio}
                    </span>
                  )}
                </TableCell>
                <TableCell>{sale.service?.name ?? 'A medida'}</TableCell>
                <TableCell>{formatTravelDate(sale.travel_date)}</TableCell>
                <TableCell className="text-right">
                  {mxn.format(Number(sale.total))}
                </TableCell>
                <TableCell>
                  <StatusBadge status={sale.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
