import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ImprimirBoton } from '@/components/imprimir-boton'
import { CompartirRecibo } from './compartir-recibo'

// Recibo imprimible PÚBLICO (sin sesión): el agente comparte el link por
// WhatsApp y el cliente final lo abre sin login. Los datos pasan por el RPC
// get_receipt_public (callable por anon); misma receta que /estado/[token].
// El botón "Imprimir / Guardar PDF" usa el diálogo del navegador.

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
type Recibo = {
  agencia: string
  logo: string | null
  email: string | null
  telefono: string | null
  folio: number
  fecha: string // ISO timestamp (issued_at)
  cliente: string | null
  concepto: string
  metodo: string | null
  tipo: 'payment' | 'refund'
  monto: number // monto de ESTE recibo
  total: number // total de la venta
  pagado: number
  saldo: number // puede ser <= 0 (liquidada / a favor)
  moneda: string // 'MXN'
}

const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : dateFmt.format(d)
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
}

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Recibo no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace no es válido o el recibo ya no está disponible. Pide a tu
          agencia que te comparta un enlace nuevo.
        </p>
      </div>
    </main>
  )
}

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ receiptId: string }>
}) {
  const { receiptId } = await params
  const supabase = await createClient()

  // Sin sesión, el cliente server usa la anon key: el RPC es callable por anon.
  // Un id malformado (no-uuid) hace fallar el RPC → misma pantalla de no encontrado.
  const { data, error } = await supabase.rpc('get_receipt_public', {
    p_receipt_id: receiptId,
  })

  if (error || data == null) return <NotFound />
  const r = data as unknown as Recibo

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: r.moneda || 'MXN',
  })
  const isRefund = r.tipo === 'refund'
  const saldo = Number(r.saldo)

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/ventas" className="text-sm text-muted-foreground hover:underline">
          ← Volver
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <CompartirRecibo />
          <ImprimirBoton />
        </div>
      </div>

      <div className="rounded-lg border bg-white p-8 text-black shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            {r.logo && (
              // Logo externo (URL fuera del dominio): <img> plano a propósito.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.logo}
                alt={`Logo de ${r.agencia}`}
                className="mb-2 h-12 w-auto object-contain"
              />
            )}
            <p className="text-xl font-bold">{r.agencia}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {[r.email, r.telefono].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
              Recibo
            </p>
            <p className="text-lg font-bold tabular-nums">Folio #{r.folio}</p>
            <p className="text-xs text-gray-500">{fmtDate(r.fecha)}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Cliente</dt>
            <dd className="font-medium">{r.cliente ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Concepto</dt>
            <dd className="font-medium">{r.concepto}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Método de pago</dt>
            <dd className="font-medium">
              {r.metodo ? METHOD_LABELS[r.metodo] ?? r.metodo : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Tipo</dt>
            <dd className="font-medium">{isRefund ? 'Reembolso' : 'Abono'}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-lg bg-gray-100 p-4 text-center print:border print:border-gray-300 print:bg-transparent">
          <p className="text-xs tracking-wide text-gray-500 uppercase">
            {isRefund ? 'Monto reembolsado' : 'Monto recibido'}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {money.format(Number(r.monto))}
          </p>
        </div>

        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Total de la venta</span>
            <span className="tabular-nums">{money.format(Number(r.total))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Pagado a la fecha</span>
            <span className="tabular-nums">{money.format(Number(r.pagado))}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente</span>
            <span className="tabular-nums">
              {saldo <= 0 ? 'Liquidada' : money.format(saldo)}
            </span>
          </div>
        </div>

        <p className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
          Comprobante interno — no es una factura fiscal (CFDI).
        </p>
      </div>
    </main>
  )
}
