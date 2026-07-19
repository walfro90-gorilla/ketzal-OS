import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { formatTravelDate, mxn } from '@/components/data/format'
import { StatusBadge, type BookingStatus } from '@/components/data/status-badge'
import { PageHeader } from '@/components/data/page-header'
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

// Historial del cliente: tabla en desktop / tarjetas en móvil. La fila enlaza
// a la venta (rowHref: columna primaria en desktop, tarjeta completa en móvil).
const ventaColumns: DataColumn<VentaCliente>[] = [
  {
    header: 'Servicio',
    primary: true,
    cell: (venta) => (
      <>
        {venta.service?.name ?? 'A medida'}
        {venta.folio && (
          <span className="ml-2 text-xs text-muted-foreground">
            {venta.folio}
          </span>
        )}
      </>
    ),
  },
  {
    header: 'Fecha de viaje',
    cell: (venta) => formatTravelDate(venta.travel_date),
  },
  {
    header: 'Total',
    align: 'right',
    cell: (venta) => (
      <span className="tabular-nums">{mxn.format(Number(venta.total))}</span>
    ),
  },
  {
    header: 'Estado',
    cell: (venta) => <StatusBadge status={venta.status} />,
  },
]

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
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Cliente no encontrado"
          description="El cliente no existe o no pertenece a tu agencia."
          backHref="/clientes"
          backLabel="Volver a clientes"
        />
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
      <PageHeader
        title={customer.full_name}
        backHref="/clientes"
        backLabel="Volver a clientes"
      />

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
            <DataList
              columns={ventaColumns}
              rows={sales}
              getRowKey={(venta) => venta.id}
              rowHref={(venta) => `/ventas/${venta.id}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
