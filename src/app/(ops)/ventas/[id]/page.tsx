import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import { ITEM_TYPE_LABELS, PASSENGER_TYPE_LABELS } from '../ui'
import { AbonosSection } from './abonos'
import { PlanPagosSection, type PlanItem } from './plan-pagos'
import { CancelarVenta } from './cancelar-venta'
import { VencimientoForm } from './vencimiento-form'

type LineItem = {
  id: string
  item_type: string
  passenger_type: string | null
  description: string | null
  qty: number
  unit_price: number | string
  line_total: number | string
}

// Columnas de las líneas: tabla en desktop / tarjetas en móvil (sin scroll
// horizontal). El pie de subtotal/descuento/total va aparte del DataList.
const lineColumns: DataColumn<LineItem>[] = [
  {
    header: 'Concepto',
    primary: true,
    cell: (item) => (
      <>
        {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
        {item.passenger_type && (
          <span className="ml-1 text-muted-foreground">
            ·{' '}
            {PASSENGER_TYPE_LABELS[item.passenger_type] ?? item.passenger_type}
          </span>
        )}
      </>
    ),
  },
  {
    header: 'Descripción',
    cell: (item) => item.description ?? '—',
  },
  {
    header: 'Cant.',
    align: 'right',
    cell: (item) => <span className="tabular-nums">{item.qty}</span>,
  },
  {
    header: 'P. unitario',
    align: 'right',
    cell: (item) => (
      <span className="tabular-nums">{mxn.format(Number(item.unit_price))}</span>
    ),
  },
  {
    header: 'Importe',
    align: 'right',
    cell: (item) => (
      <span className="tabular-nums">{mxn.format(Number(item.line_total))}</span>
    ),
  },
]

type BookingDetail = {
  id: string
  folio: string | null
  travel_date: string | null
  due_date: string | null
  num_pax: number
  subtotal: number
  discount: number
  total: number
  currency: string
  status: BookingStatus
  payment_type: string
  plan_frequency: string | null
  plan_final_date: string | null
  notes: string | null
  cancel_reason: string | null
  created_at: string
  owner_supplier_id: string
  selling_supplier_id: string
  customer: { full_name: string; phone: string | null } | null
  service: { name: string } | null
}

export default async function VentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, folio, travel_date, due_date, num_pax, subtotal, discount, total, currency, status, payment_type, plan_frequency, plan_final_date, notes, cancel_reason, created_at, owner_supplier_id, selling_supplier_id, customer:customers(full_name, phone), service:services(name)'
    )
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  // Los tipos generados a mano no describen las relaciones (FK), así que la
  // inferencia del select anidado falla: cast estrecho del resultado.
  const booking = data as unknown as BookingDetail

  // Reventa: el dueño del servicio es otra agencia → la venta genera comisión.
  // Vía RPC y no `from('suppliers')`: desde la migración 006 la RLS sólo deja
  // ver tu agencia y tus proveedores, así que leer la tabla aquí devolvería
  // null. `agency_name` es SECURITY DEFINER y sólo puede devolver el nombre —
  // la comisión de la otra agencia sigue siendo privada.
  let ownerName: string | null = null
  if (booking.owner_supplier_id !== booking.selling_supplier_id) {
    const { data: owner } = await supabase.rpc('agency_name' as never, {
      p_id: booking.owner_supplier_id,
    } as never)
    ownerName = (owner as string | null) ?? null
  }

  const { data: items, error: itemsError } = await supabase
    .from('booking_items')
    .select('id, item_type, passenger_type, description, qty, unit_price, line_total')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })

  // Ledger de la venta (RLS por supplier): abonos/reembolsos y sus recibos.
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('id, amount_mxn, type, status, payment_method, paid_at')
    .eq('booking_id', id)
    .order('paid_at')

  const { data: receipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('id, payment_id, folio')
    .eq('booking_id', id)

  // Calendario sugerido del plan de pagos (seq 0 = enganche).
  const { data: schedule } = await supabase
    .from('payment_schedule')
    .select('seq, kind, due_date, amount')
    .eq('booking_id', id)
    .order('seq')

  const createdAt = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
  }).format(new Date(booking.created_at))

  const cancelada = booking.status === 'cancelled'
  // La zona de peligro solo aplica a ventas vivas: no pagadas ni ya canceladas.
  const puedeCancelar = !cancelada && booking.status !== 'paid'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/ventas"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a ventas
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            Venta {booking.folio ?? `#${booking.id.slice(0, 8)}`}
          </h1>
          <StatusBadge status={booking.status} />
        </div>
        {ownerName && (
          <p className="mt-1 text-sm text-muted-foreground">
            Reventa de {ownerName} — genera comisión
          </p>
        )}
        {cancelada && booking.cancel_reason && (
          <p className="mt-1 text-sm text-muted-foreground">
            Motivo: {booking.cancel_reason}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la venta</CardTitle>
          <CardDescription>Registrada el {createdAt}.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="mt-1 font-medium">
                {booking.customer?.full_name ?? 'Sin cliente'}
                {booking.customer?.phone && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {booking.customer.phone}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Servicio</dt>
              <dd className="mt-1 font-medium">
                {booking.service?.name ?? 'A medida'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de viaje</dt>
              <dd className="mt-1 font-medium">
                {formatTravelDate(booking.travel_date)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pasajeros</dt>
              <dd className="mt-1 font-medium">{booking.num_pax}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Fecha límite de pago</dt>
              <dd className="mt-1">
                {cancelada ? (
                  <span className="font-medium">
                    {formatTravelDate(booking.due_date)}
                  </span>
                ) : (
                  <VencimientoForm
                    bookingId={booking.id}
                    dueDate={booking.due_date}
                  />
                )}
              </dd>
            </div>
            {booking.notes && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Notas</dt>
                <dd className="mt-1">{booking.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Líneas de la venta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {itemsError ? (
            <p className="text-sm text-destructive">
              Error al leer las líneas: {itemsError.message}
            </p>
          ) : !items || items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta venta no tiene líneas registradas.
            </p>
          ) : (
            <DataList
              columns={lineColumns}
              rows={items as unknown as LineItem[]}
              getRowKey={(item) => item.id}
            />
          )}

          <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {mxn.format(Number(booking.subtotal))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <span className="tabular-nums">
                −{mxn.format(Number(booking.discount))}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {mxn.format(Number(booking.total))}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <PlanPagosSection
        bookingId={booking.id}
        total={Number(booking.total)}
        travelDate={booking.travel_date}
        paymentType={booking.payment_type}
        planFrequency={booking.plan_frequency}
        planFinalDate={booking.plan_final_date}
        schedule={(schedule ?? []) as unknown as PlanItem[]}
        cancelled={cancelada}
      />

      {paymentsError || receiptsError ? (
        <Card>
          <CardHeader>
            <CardTitle>Abonos y recibo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              Error al leer los abonos:{' '}
              {(paymentsError ?? receiptsError)?.message}
            </p>
          </CardContent>
        </Card>
      ) : (
        <AbonosSection
          bookingId={booking.id}
          total={Number(booking.total)}
          payments={payments ?? []}
          receipts={receipts ?? []}
          cancelled={cancelada}
        />
      )}

      {puedeCancelar && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Zona de peligro</CardTitle>
            <CardDescription>
              Cancelar la venta la marca como cancelada y bloquea nuevos
              abonos. Los pagos registrados no se borran (ledger append-only).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CancelarVenta bookingId={booking.id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
