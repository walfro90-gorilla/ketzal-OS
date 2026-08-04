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
import { resolverSpei } from './spei-actions'

// b034: transferencias SPEI declaradas por compradores del marketplace, a la
// espera de que el admin las confirme contra su banca. Aprobar registra el
// abono (ledger) con la misma lógica que un pago de MP; rechazar deja al
// comprador volver a intentar (o pagar por MP).

export type SpeiPendiente = {
  id: string
  booking_id: string
  amount: number
  reference: string | null
  created_at: string
  cliente: string
  servicio: string
  total: number
  balance: number
}

export function SpeiPendientes({ rows }: { rows: SpeiPendiente[] }) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!rows.length) return null

  function resolver(row: SpeiPendiente, aprobar: boolean) {
    const msg = aprobar
      ? `¿Confirmas que recibiste la transferencia de ${mxn.format(row.amount)} de ${row.cliente}? Se registrará el abono.`
      : `¿Rechazar la transferencia declarada por ${row.cliente}? Podrá volver a intentar o pagar en línea.`
    if (!window.confirm(msg)) return
    setBusyId(row.id)
    startTransition(async () => {
      const res = await resolverSpei(row.id, aprobar)
      setBusyId(null)
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
              <Link
                href={`/ventas/${r.booking_id}`}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                Ver venta →
              </Link>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                loading={isPending && busyId === r.id}
                onClick={() => resolver(r, true)}
              >
                Confirmar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => resolver(r, false)}
              >
                Rechazar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
