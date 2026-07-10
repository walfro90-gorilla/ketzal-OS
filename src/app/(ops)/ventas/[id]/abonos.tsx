'use client'

import { useState, useTransition, type ComponentProps } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { balance } from '@/lib/domain/balance'
import { mxn } from '../ui'
import {
  compartirEstadoCuenta,
  crearLinkPago,
  emitirRecibo,
  registrarAbono,
} from './actions'

export type AbonoRow = {
  id: string
  amount_mxn: number
  type: 'payment' | 'refund'
  status: string
  payment_method: string | null
  paid_at: string | null
}

export type ReciboRow = {
  id: string
  payment_id: string | null
  folio: number
}

// Mismo estilo de <select> nativo alineado al Input de shadcn que en nueva-venta-form.
const selectClass =
  'h-11 md:h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

// Mismo NativeSelect que en nueva-venta-form (no está exportado allá):
// <select> nativo con chevron repuesto — en móvil el picker del SO es mejor UX.
function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'otro', label: 'Otro' },
] as const

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METODOS.map((m) => [m.value, m.label])
)

const paidAtFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

function formatPaidAt(paidAt: string | null): string {
  if (!paidAt) return '—'
  const parsed = new Date(paidAt)
  if (Number.isNaN(parsed.getTime())) return paidAt
  return paidAtFormatter.format(parsed)
}

/** Hoy en formato YYYY-MM-DD (zona local), para el default del input date. */
function hoy(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function AbonosSection({
  bookingId,
  total,
  payments,
  receipts,
  cancelled = false,
}: {
  bookingId: string
  total: number
  payments: AbonoRow[]
  receipts: ReciboRow[]
  /** Venta cancelada: la lista/saldo quedan visibles pero ya no se registran abonos. */
  cancelled?: boolean
}) {
  const [isRegistering, startRegistering] = useTransition()
  const [isEmitting, startEmitting] = useTransition()
  const [isCharging, startCharging] = useTransition()
  const [isSharing, startSharing] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [emittingId, setEmittingId] = useState<string | null>(null)

  // Saldo derivado (regla de oro): total − pagos + reembolsos.
  const saldo = balance(
    total,
    payments.map((p) => ({ type: p.type, amount: Number(p.amount_mxn), status: p.status }))
  )
  const pagado = total - saldo
  const liquidada = saldo <= 0

  // Formulario de registro
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>('efectivo')
  const [date, setDate] = useState(hoy)
  const [tipo, setTipo] = useState<'payment' | 'refund'>('payment')

  // Cobro en línea: monto editable (permite anticipos), prellenado con el saldo.
  const [montoCobro, setMontoCobro] = useState(() => String(saldo))
  const montoCobroNum = Number(montoCobro)
  const cobroValido =
    montoCobro.trim() !== '' &&
    Number.isFinite(montoCobroNum) &&
    montoCobroNum > 0 &&
    montoCobroNum <= saldo

  const reciboByPayment = new Map(
    receipts
      .filter((r) => r.payment_id != null)
      .map((r) => [r.payment_id as string, r])
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError('El monto debe ser un número mayor que 0.')
      return
    }

    startRegistering(async () => {
      const result = await registrarAbono(bookingId, {
        amount: amountNum,
        method,
        date,
        type: tipo,
      })
      if ('error' in result) {
        setFormError(result.error)
        return
      }
      // revalidatePath refresca la lista; solo limpiamos el monto.
      setAmount('')
      toast.success(
        tipo === 'refund' ? 'Reembolso registrado' : 'Abono registrado'
      )
    })
  }

  function handleCobrar() {
    if (!cobroValido) return
    startCharging(async () => {
      const result = await crearLinkPago(bookingId, montoCobroNum)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
      toast.success('Link de pago generado')
    })
  }

  function handleCompartir() {
    startSharing(async () => {
      const result = await compartirEstadoCuenta(bookingId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      // Mismo UX que compartir cotización: link por WhatsApp + copia al portapapeles.
      const msg = `Hola, aquí está tu estado de cuenta: ${result.url}`
      window.open(
        `https://wa.me/?text=${encodeURIComponent(msg)}`,
        '_blank',
        'noopener,noreferrer'
      )
      try {
        await navigator.clipboard.writeText(result.url)
        toast.success('Link de estado de cuenta copiado')
      } catch {
        toast.error('No se pudo copiar el link.')
      }
    })
  }

  function handleEmitir(paymentId: string) {
    setReceiptError(null)
    setEmittingId(paymentId)
    startEmitting(async () => {
      const result = await emitirRecibo(bookingId, paymentId)
      if ('error' in result) setReceiptError(result.error)
      else toast.success('Recibo emitido')
      setEmittingId(null)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abonos y recibo</CardTitle>
        <CardDescription>
          Ledger de pagos de la venta: registra abonos o reembolsos y emite recibos internos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumen de saldo */}
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="mt-1 text-lg font-medium tabular-nums">{mxn.format(total)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pagado</p>
            <p className="mt-1 text-lg font-medium tabular-nums">{mxn.format(pagado)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Saldo</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-2xl font-bold tabular-nums">{mxn.format(saldo)}</p>
              {liquidada && (
                <Badge className="bg-emerald-600 text-white">Liquidada</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Cobro en línea (Mercado Pago) — solo con saldo pendiente y venta activa.
            El monto es editable para permitir anticipos parciales. */}
        {!cancelled && saldo > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="cobro-monto">Monto a cobrar</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="cobro-monto"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={montoCobro}
                onChange={(e) => setMontoCobro(e.target.value)}
                className="sm:w-40"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCobrar}
                disabled={isCharging || !cobroValido}
              >
                {isCharging ? 'Generando…' : 'Cobrar en línea'}
              </Button>
            </div>
            {!cobroValido && (
              <p className="text-xs text-destructive">
                El monto debe ser mayor a 0. Máximo: {mxn.format(saldo)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Genera un link de Mercado Pago (tarjeta, OXXO, SPEI). El abono se
              registra solo al pagar.
            </p>
          </div>
        )}

        {/* Estado de cuenta público: link de solo lectura para el cliente
            (válido también en ventas canceladas — el ledger sigue siendo real). */}
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleCompartir}
            disabled={isSharing}
          >
            {isSharing ? 'Generando…' : 'Compartir estado de cuenta'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Abre WhatsApp con el link público (total, abonos y saldo) y lo copia
            al portapapeles.
          </p>
        </div>

        {/* Lista de abonos */}
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin abonos todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Recibo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const recibo = reciboByPayment.get(p.id)
                  const isRefund = p.type === 'refund'
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{formatPaidAt(p.paid_at)}</TableCell>
                      <TableCell>
                        {p.payment_method
                          ? METHOD_LABELS[p.payment_method] ?? p.payment_method
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRefund ? 'destructive' : 'secondary'}>
                          {isRefund ? 'Reembolso' : 'Abono'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isRefund ? '−' : ''}
                        {mxn.format(Number(p.amount_mxn))}
                      </TableCell>
                      <TableCell>
                        {recibo != null ? (
                          <a
                            href={`/recibo/${recibo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm underline underline-offset-2 hover:no-underline"
                          >
                            Recibo #{recibo.folio}
                          </a>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEmitir(p.id)}
                            disabled={isEmitting}
                          >
                            {isEmitting && emittingId === p.id
                              ? 'Emitiendo…'
                              : 'Emitir recibo'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {receiptError && (
          <p role="alert" className="text-sm text-destructive">
            {receiptError}
          </p>
        )}

        {/* Registrar abono (oculto si la venta está cancelada) */}
        {cancelled ? (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Venta cancelada — no se registran más abonos.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
            <p className="text-sm font-medium">Registrar abono</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="abono-monto">Monto *</Label>
                <Input
                  id="abono-monto"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abono-metodo">Método</Label>
                <NativeSelect
                  id="abono-metodo"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {METODOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="abono-fecha">Fecha</Label>
                <Input
                  id="abono-fecha"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abono-tipo">Tipo</Label>
                <NativeSelect
                  id="abono-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'payment' | 'refund')}
                >
                  <option value="payment">Abono</option>
                  <option value="refund">Reembolso</option>
                </NativeSelect>
              </div>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={isRegistering}>
              {isRegistering ? 'Registrando…' : 'Registrar'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
