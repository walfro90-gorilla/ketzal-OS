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
  provider_rating: number | null
  provider_comment: string | null
  app_rating: number | null
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

/** Selector de estrellas 1-5. readOnly ⇒ muestra la calificación sin editar. */
function StarPicker({
  value,
  onChange,
  readOnly = false,
}: {
  value: number
  onChange?: (n: number) => void
  readOnly?: boolean
}) {
  const [hover, setHover] = useState(0)
  const shown = readOnly ? value : hover || value
  return (
    <div className="flex gap-1" role={readOnly ? 'img' : 'radiogroup'} aria-label={readOnly ? `${value} de 5 estrellas` : 'Calificación'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
          aria-pressed={!readOnly ? n <= value : undefined}
          className={cn('p-0.5', readOnly ? 'cursor-default' : 'cursor-pointer')}
        >
          <StarIcon
            className={cn(
              readOnly ? 'size-5' : 'size-7',
              n <= shown ? 'fill-primary text-primary' : 'text-muted-foreground/40'
            )}
          />
        </button>
      ))}
    </div>
  )
}

export function OrderCard({ order }: { order: Order }) {
  const [busy, setBusy] = useState(false)
  // Calificación (viajero→proveedor + →app). Editable: submit_rating hace upsert,
  // así que se muestra lo ya calificado (read-only) con opción de editar.
  const [prov, setProv] = useState(order.provider_rating ?? 0)
  const [comentario, setComentario] = useState(order.provider_comment ?? '')
  const [app, setApp] = useState(order.app_rating ?? 0)
  const [provListo, setProvListo] = useState(order.rated_provider)
  const [appListo, setAppListo] = useState(order.rated_app)
  const [editProv, setEditProv] = useState(false)
  const [editApp, setEditApp] = useState(false)
  // Baseline de lo guardado (para restaurar al cancelar una edición).
  const [savedProv, setSavedProv] = useState(order.provider_rating ?? 0)
  const [savedComentario, setSavedComentario] = useState(order.provider_comment ?? '')
  const [savedApp, setSavedApp] = useState(order.app_rating ?? 0)

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
    setEditProv(false)
    setSavedProv(prov)
    setSavedComentario(comentario)
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
    setEditApp(false)
    setSavedApp(app)
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
              loading={busy}
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
                loading={busy}
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
            {/* Viajero → proveedor */}
            {provListo && !editProv ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Tu reseña</p>
                <StarPicker value={savedProv} readOnly />
                {savedComentario && (
                  <p className="text-sm text-muted-foreground">“{savedComentario}”</p>
                )}
                <button
                  type="button"
                  onClick={() => setEditProv(true)}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Editar
                </button>
              </div>
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
                <div className="flex gap-2">
                  <Button type="button" loading={busy} onClick={enviarProveedor}>
                    {provListo ? 'Guardar' : 'Enviar reseña'}
                  </Button>
                  {editProv && (
                    <Button
                      type="button"
                      variant="ghost"
                      loading={busy}
                      onClick={() => {
                        setEditProv(false)
                        setProv(savedProv)
                        setComentario(savedComentario)
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Viajero → app */}
            {appListo && !editApp ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Calificaste la app Ketzal</p>
                <div className="flex items-center gap-3">
                  <StarPicker value={savedApp} readOnly />
                  <button
                    type="button"
                    onClick={() => setEditApp(true)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">¿Y la app Ketzal?</p>
                <StarPicker value={app} onChange={setApp} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" loading={busy} onClick={enviarApp}>
                    {appListo ? 'Guardar' : 'Enviar'}
                  </Button>
                  {editApp && (
                    <Button
                      type="button"
                      variant="ghost"
                      loading={busy}
                      onClick={() => {
                        setEditApp(false)
                        setApp(savedApp)
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
