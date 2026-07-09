import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatTravelDate,
  mxn,
  StatusBadge,
  type BookingStatus,
} from '../../ventas/ui'
import { ClienteForm } from '../cliente-form'

type VentaCliente = {
  id: string
  folio: string | null
  total: number
  status: BookingStatus
  travel_date: string | null
  created_at: string
  service: { name: string } | null
}

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // RLS: solo se ve si el cliente pertenece a la agencia del agente.
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !customer) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href="/clientes"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a clientes
        </Link>
        <h1 className="text-2xl font-semibold">Cliente no encontrado</h1>
        <p className="text-sm text-muted-foreground">
          El cliente no existe o no pertenece a tu agencia.
        </p>
      </div>
    )
  }

  const { data: ventas, error: ventasError } = await supabase
    .from('bookings')
    .select(
      'id, folio, total, status, travel_date, created_at, service:services(name)'
    )
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  // Los tipos generados a mano no describen las relaciones (FK), así que la
  // inferencia del select anidado falla: cast estrecho del resultado.
  const sales = (ventas ?? []) as unknown as VentaCliente[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/clientes"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{customer.full_name}</h1>
      </div>

      <ClienteForm
        customerId={customer.id}
        initial={{
          full_name: customer.full_name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          doc_id: customer.doc_id ?? '',
          notes: customer.notes ?? '',
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Historial de ventas</CardTitle>
          <CardDescription>
            Ventas y cotizaciones registradas para este cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ventasError ? (
            <p className="text-sm text-destructive">
              Error al leer las ventas: {ventasError.message}
            </p>
          ) : sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Fecha de viaje</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((venta) => (
                    <TableRow key={venta.id}>
                      <TableCell>
                        <Link
                          href={`/ventas/${venta.id}`}
                          className="font-medium hover:underline"
                        >
                          {venta.service?.name ?? 'A medida'}
                        </Link>
                        {venta.folio && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {venta.folio}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatTravelDate(venta.travel_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mxn.format(Number(venta.total))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={venta.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
