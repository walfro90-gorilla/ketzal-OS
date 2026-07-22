'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { StarIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { crearLinkPagoMarketplace, calificar } from '@/app/comprar/actions'

export type Order = {
  booking_id: string
  service_id: string | null
  status: string
  travel_date: string | null
  payment_type: string
  service_name: string
  total: number
  paid: number
  balance: number
  next_due: number
  next_due_date: string | null
  can_rate: boolean
  rated_provider: boolean
  rated_app: boolean
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const ESTADO: Record<string, string> = {
  draft: 'Pendiente de pago',
  reserved: 'Apartado (en abonos)',
  paid: 'Pagado',
}

/** 'YYYY-MM-DD' → '12 mar 2026' (local, sin corrimiento de zona). */
function fechaCorta(d: string | null): string | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, day)
  )
}

/** Recordatorio del próximo abono con urgencia (vencido / hoy / en N días). */
function abonoAviso(
  d: string | null
): { text: string; tone: 'danger' | 'warn' | 'muted' } | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  const due = new Date(y, m - 1, day)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const dias = Math.round((due.getTime() - hoy.getTime()) / 86400000)
  const f = fechaCorta(d)
  if (dias < 0) return { text: `Abono vencido (venció el ${f})`, tone: 'danger' }
  if (dias === 0) return { text: 'Tu abono vence hoy', tone: 'warn' }
  if (dias <= 7) return { text: `Tu abono vence en ${dias} día${dias > 1 ? 's' : ''} · ${f}`, tone: 'warn' }
  return { text: `Próximo abono: ${f}`, tone: 'muted' }
}

const TONO: Record<'danger' | 'warn' | 'muted', string> = {
  danger: 'text-destructive',
  warn: 'text-amber-600 dark:text-amber-500',
  muted: 'text-muted-foreground',
}

/** Selector de estrellas 1-5. */
function StarPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
          className="p-0.5"
        >
          <StarIcon
            className={`size-7 ${n <= value ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`}
          />
        </button>
      ))}
    </div>
  )
}

export function OrderCard({ order }: { order: Order }) {
  const [busy, setBusy] = useState(false)
  // Calificación (viajero→proveedor + →app)
  const [prov, setProv] = useState(0)
  const [comentario, setComentario] = useState('')
  const [app, setApp] = useState(0)
  const [provListo, setProvListo] = useState(order.rated_provider)
  const [appListo, setAppListo] = useState(order.rated_app)

  async function pagar(amount?: number) {
    if (!order.service_id) return
    setBusy(true)
    const res = await crearLinkPagoMarketplace(order.booking_id, order.service_id, amount)
    if ('error' in res) {
      toast.error(res.error)
      setBusy(false)
      return
    }
    window.location.href = res.url
  }

  async function enviarProveedor() {
    if (prov < 1) {
      toast.error('Elige de 1 a 5 estrellas.')
      return
    }
    setBusy(true)
    const res = await calificar(order.booking_id, 'traveler_to_provider', prov, comentario)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setProvListo(true)
    toast.success('¡Gracias por tu reseña!')
  }

  async function enviarApp() {
    if (app < 1) {
      toast.error('Elige de 1 a 5 estrellas.')
      return
    }
    setBusy(true)
    const res = await calificar(order.booking_id, 'traveler_to_app', app)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setAppListo(true)
    toast.success('¡Gracias!')
  }

  const conPlan = order.payment_type === 'abonos'

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/mis-compras/${order.booking_id}`}
              className="group flex items-center gap-1 font-semibold hover:text-primary"
            >
              <span className="truncate">{order.service_name}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
            <p className="text-xs text-muted-foreground">
              {[ESTADO[order.status] ?? order.status, fechaCorta(order.travel_date)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <span className="shrink-0 text-right text-sm tabular-nums">
            <span className="font-semibold">{mxn.format(order.total)}</span>
            {order.balance > 0 && (
              <span className="block text-xs text-muted-foreground">
                Saldo {mxn.format(order.balance)}
              </span>
            )}
          </span>
        </div>

        {/* Pago pendiente */}
        {order.balance > 0 && order.service_id && (
          <div className="flex flex-col gap-2">
            {conPlan &&
              (() => {
                const aviso = abonoAviso(order.next_due_date)
                return aviso ? (
                  <p className={cn('flex items-center gap-1.5 text-sm font-medium', TONO[aviso.tone])}>
                    <ClockIcon className="size-4 shrink-0" /> {aviso.text}
                  </p>
                ) : null
              })()}
            <Button
              type="button"
              size="touch"
              className="w-full"
              disabled={busy}
              onClick={() => pagar(conPlan ? order.next_due : undefined)}
            >
              {busy
                ? 'Abriendo pago…'
                : conPlan
                  ? `Pagar siguiente abono ${mxn.format(order.next_due)}`
                  : `Pagar ${mxn.format(order.balance)}`}
            </Button>
            {conPlan && order.next_due < order.balance && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => pagar(order.balance)}
              >
                Liquidar todo {mxn.format(order.balance)}
              </Button>
            )}
          </div>
        )}

        {/* Calificación post-viaje */}
        {order.can_rate && (
          <div className="space-y-4 border-t pt-4">
            {provListo ? (
              <p className="text-sm text-muted-foreground">
                Ya calificaste este viaje. ¡Gracias!
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Califica tu viaje</p>
                <StarPicker value={prov} onChange={setProv} />
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="¿Cómo estuvo? (opcional)"
                  rows={2}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                />
                <Button type="button" disabled={busy} onClick={enviarProveedor}>
                  Enviar reseña
                </Button>
              </div>
            )}

            {!appListo && (
              <div className="space-y-2">
                <p className="text-sm font-medium">¿Y la app Ketzal?</p>
                <StarPicker value={app} onChange={setApp} />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={enviarApp}
                >
                  Enviar
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
