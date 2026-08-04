'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArmchairIcon, CircleCheckIcon, UndoIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { marcarAbordaje } from '../abordaje-actions'

// Panel de check-in de abordaje (b043): caza a cada viajero con su asiento y
// registra la hora al marcarlo abordado. Idempotente (la hora original se
// conserva); "Deshacer" corrige un error.

export type PaxAbordaje = {
  id: string
  full_name: string
  passenger_type: string | null
  seat: number | null
  boarded_at: string | null
}

const hora = new Intl.DateTimeFormat('es-MX', {
  hour: 'numeric',
  minute: '2-digit',
})

export function PanelAbordaje({
  voucherId,
  pasajeros,
}: {
  voucherId: string
  pasajeros: PaxAbordaje[]
}) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const abordados = pasajeros.filter((p) => p.boarded_at).length

  function marcar(p: PaxAbordaje, board: boolean) {
    setBusyId(p.id)
    startTransition(async () => {
      const res = await marcarAbordaje(voucherId, p.id, board)
      setBusyId(null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(board ? `${p.full_name} a bordo ✓` : 'Abordaje deshecho')
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Abordaje
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            abordados >= pasajeros.length && pasajeros.length > 0
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}
        >
          {abordados}/{pasajeros.length} a bordo
        </span>
      </div>

      {pasajeros.length === 0 ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Esta venta no tiene pasajeros registrados. Captúralos en la venta (o
          pide al cliente que los registre) antes de abordar.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {pasajeros.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-md border text-xs font-bold tabular-nums ${
                  p.seat != null
                    ? 'border-teal-300 bg-teal-500/10 text-teal-700 dark:border-teal-800 dark:text-teal-400'
                    : 'border-dashed text-muted-foreground'
                }`}
                title={p.seat != null ? `Asiento ${p.seat}` : 'Sin asiento'}
              >
                {p.seat != null ? p.seat : <ArmchairIcon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.full_name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.passenger_type ?? ''}
                  {p.boarded_at
                    ? ` · a bordo ${hora.format(new Date(p.boarded_at))}`
                    : ''}
                </span>
              </span>
              {p.boarded_at ? (
                <span className="flex items-center gap-1.5">
                  <CircleCheckIcon className="size-5 text-emerald-600 dark:text-emerald-500" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => marcar(p, false)}
                    aria-label={`Deshacer abordaje de ${p.full_name}`}
                  >
                    <UndoIcon className="size-4" />
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  loading={isPending && busyId === p.id}
                  onClick={() => marcar(p, true)}
                >
                  Abordar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
