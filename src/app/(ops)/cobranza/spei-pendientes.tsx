'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LandmarkIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { mxn } from '@/components/data/format'
import { resolverSpei, reabrirSpei } from './spei-actions'

// b034: transferencias SPEI declaradas por compradores del marketplace, a la
// espera de que el admin las confirme contra su banca. Aprobar registra el
// abono (ledger) con la misma lógica que un pago de MP; rechazar deja al
// comprador volver a intentar (o pagar por MP).

export type SpeiPendiente = {
  id: string
  booking_id: string
  amount: number
  reference: string | null
  /** Comprobante del pago (captura subida por el comprador, b035). */
  receipt_url: string | null
  created_at: string
  cliente: string
  servicio: string
  total: number
  balance: number
}

export function SpeiPendientes({ rows }: { rows: SpeiPendiente[] }) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<{ id: string; aprobar: boolean } | null>(null)

  if (!rows.length) return null

  function resolver(row: SpeiPendiente, aprobar: boolean) {
    setBusyId(row.id)
    startTransition(async () => {
      const res = await resolverSpei(row.id, aprobar)
      setBusyId(null)
      setConfirmando(null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(aprobar ? 'Transferencia confirmada: abono registrado.' : 'Transferencia rechazada.')
    })
  }

  return (
    <Card className="bg-amber-500/5 ring-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4" /> Transferencias por confirmar (
          {rows.length})
        </CardTitle>
        <CardDescription>
          Compradores que declararon una transferencia SPEI. Verifica en tu
          banca que el dinero llegó y confírmala: se registra el abono
          automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              {/* Comprobante (b035): thumbnail clicable, abre en pestaña nueva.
                  b088: ya no es la URL pública del bucket sino /api/comprobante,
                  que firma contra el bucket privado tras revalidar la RLS. */}
              {r.receipt_url && (
                <a
                  href={`/api/comprobante?intent=${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 overflow-hidden rounded-md border"
                  aria-label="Ver comprobante"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/comprobante?intent=${r.id}`}
                    alt="Comprobante"
                    className="size-14 object-cover"
                  />
                </a>
              )}
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {r.cliente} · {mxn.format(r.amount)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.servicio}
                  {r.reference ? ` · Ref: ${r.reference}` : ''} ·{' '}
                  {new Intl.DateTimeFormat('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(r.created_at))}
                </p>
                <p className="flex gap-3 text-xs">
                  {r.receipt_url && (
                    <a
                      href={`/api/comprobante?intent=${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Ver comprobante →
                    </a>
                  )}
                  <Link
                    href={`/ventas/${r.booking_id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Ver venta →
                  </Link>
                </p>
              </div>
            </div>
            {confirmando?.id === r.id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
                <span className="text-xs text-muted-foreground">
                  {confirmando.aprobar
                    ? `¿Recibiste ${mxn.format(r.amount)}? Se registrará el abono.`
                    : '¿Rechazar esta transferencia?'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmando(null)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={confirmando.aprobar ? 'default' : 'destructive'}
                  loading={isPending && busyId === r.id}
                  onClick={() => resolver(r, confirmando.aprobar)}
                >
                  Sí, {confirmando.aprobar ? 'confirmar' : 'rechazar'}
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setConfirmando({ id: r.id, aprobar: true })}
                >
                  Confirmar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmando({ id: r.id, aprobar: false })}
                >
                  Rechazar
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// b037: rechazadas recientes — auditoría (comprobante siempre consultable) y
// corrección: "Reabrir" la vuelve pendiente para confirmarla por el camino
// normal (guards en el RPC: no cancelada, sin otra pendiente de la venta).

export type SpeiRechazada = {
  id: string
  booking_id: string
  amount: number
  reference: string | null
  receipt_url: string | null
  created_at: string
  updated_at: string
  cliente: string
  servicio: string
  booking_status: string
  balance: number
}

export function SpeiRechazadas({ rows }: { rows: SpeiRechazada[] }) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  if (!rows.length) return null

  function reabrir(row: SpeiRechazada) {
    setBusyId(row.id)
    startTransition(async () => {
      const res = await reabrirSpei(row.id)
      setBusyId(null)
      setConfirmandoId(null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Transferencia reabierta: está de nuevo por confirmar.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Transferencias rechazadas (últimos 14 días)
        </CardTitle>
        <CardDescription>
          Nada se borra: el comprobante queda guardado. Si rechazaste una por
          error y el dinero sí llegó, reábrela y confírmala.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">
                {r.cliente} · {mxn.format(r.amount)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.servicio}
                {r.reference ? ` · Ref: ${r.reference}` : ''} · rechazada{' '}
                {new Intl.DateTimeFormat('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(r.updated_at))}
              </p>
              <p className="flex gap-3 text-xs">
                {r.receipt_url && (
                  <a
                    href={`/api/comprobante?intent=${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Ver comprobante →
                  </a>
                )}
                <Link
                  href={`/ventas/${r.booking_id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Ver venta →
                </Link>
              </p>
            </div>
            {confirmandoId === r.id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
                <span className="text-xs text-muted-foreground">
                  ¿Reabrir? Volverá a &quot;por confirmar&quot;.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmandoId(null)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={isPending && busyId === r.id}
                  onClick={() => reabrir(r)}
                >
                  Sí, reabrir
                </Button>
              </div>
            ) : (
              <div className="shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmandoId(r.id)}
                >
                  Reabrir
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
