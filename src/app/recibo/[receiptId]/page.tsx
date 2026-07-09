import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ImprimirBoton } from '@/components/imprimir-boton'

// Recibo imprimible (standalone, fuera de (ops) → sin menú; protegido por el proxy).
// El botón "Imprimir / Guardar PDF" usa el diálogo del navegador.

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : dateFmt.format(d)
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
}

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ receiptId: string }>
}) {
  const { receiptId } = await params
  const supabase = await createClient()

  const { data: receipt } = await supabase
    .from('receipts')
    .select('id, folio, amount, issued_at, payment_id, booking_id, supplier_id')
    .eq('id', receiptId)
    .single()
  if (!receipt) notFound()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, total, customer_id, service_id')
    .eq('id', receipt.booking_id)
    .single()
  if (!booking) notFound()

  const { data: agency } = await supabase
    .from('suppliers')
    .select('name, contact_email, phone_number')
    .eq('id', receipt.supplier_id)
    .single()

  const { data: customer } = await supabase
    .from('customers')
    .select('full_name, phone')
    .eq('id', booking.customer_id)
    .single()

  const { data: service } = booking.service_id
    ? await supabase.from('services').select('name').eq('id', booking.service_id).single()
    : { data: null }

  const { data: payment } = receipt.payment_id
    ? await supabase
        .from('payments')
        .select('payment_method, type')
        .eq('id', receipt.payment_id)
        .single()
    : { data: null }

  const { data: allPays } = await supabase
    .from('payments')
    .select('amount_mxn, type, status')
    .eq('booking_id', booking.id)

  const pagado = (allPays ?? [])
    .filter((p) => p.status === 'COMPLETED')
    .reduce(
      (s, p) => s + (p.type === 'payment' ? Number(p.amount_mxn) : -Number(p.amount_mxn)),
      0
    )
  const saldo = Number(booking.total) - pagado

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/ventas/${booking.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver
        </Link>
        <ImprimirBoton />
      </div>

      <div className="rounded-lg border bg-white p-8 text-black shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-gray-200 pb-4">
          <div>
            <p className="text-xl font-bold">{agency?.name ?? 'Agencia'}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {[agency?.contact_email, agency?.phone_number].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
              Recibo
            </p>
            <p className="text-lg font-bold tabular-nums">Folio #{receipt.folio}</p>
            <p className="text-xs text-gray-500">{fmtDate(receipt.issued_at)}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Cliente</dt>
            <dd className="font-medium">{customer?.full_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Concepto</dt>
            <dd className="font-medium">{service?.name ?? 'Venta de viaje'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Método de pago</dt>
            <dd className="font-medium">
              {payment?.payment_method
                ? METHOD_LABELS[payment.payment_method] ?? payment.payment_method
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Tipo</dt>
            <dd className="font-medium">
              {payment?.type === 'refund' ? 'Reembolso' : 'Abono'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-lg bg-gray-100 p-4 text-center print:border print:border-gray-300 print:bg-transparent">
          <p className="text-xs tracking-wide text-gray-500 uppercase">Monto recibido</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {mxn.format(Number(receipt.amount))}
          </p>
        </div>

        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Total de la venta</span>
            <span className="tabular-nums">{mxn.format(Number(booking.total))}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente</span>
            <span className="tabular-nums">{mxn.format(saldo)}</span>
          </div>
        </div>

        <p className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
          Comprobante interno — no es una factura fiscal (CFDI).
        </p>
      </div>
    </main>
  )
}
