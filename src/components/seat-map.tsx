'use client'

import { cn } from '@/lib/utils'
import {
  filasAsientos,
  TRANSPORT_LABELS,
  type TransportType,
} from '@/lib/domain/seats'

// Mapa de asientos (b041), compartido por el viajero (/mis-compras) y el
// staff (/ventas). Colores: disponible teal, seleccionado azul, ocupado rojo.
// `occupied` NO debe incluir el asiento actual del pasajero en edición (el
// padre lo excluye) para que pueda re-elegirlo/conservarlo.

export function SeatMap({
  tipo,
  total,
  occupied,
  selected,
  onPick,
  disabled = false,
}: {
  tipo: TransportType
  total: number
  occupied: number[]
  selected: number | null
  onPick: (n: number) => void
  disabled?: boolean
}) {
  const filas = filasAsientos(tipo, total)
  const ocupados = new Set(occupied)

  return (
    <div className="space-y-2">
      <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
        Frente · {TRANSPORT_LABELS[tipo]}
      </p>
      <div className="mx-auto w-fit space-y-1.5 rounded-lg border p-3">
        {filas.map((fila, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {fila.map((n, j) =>
              n == null ? (
                <span key={`p${j}`} className="w-4" aria-hidden />
              ) : (
                <button
                  key={n}
                  type="button"
                  disabled={disabled || ocupados.has(n)}
                  onClick={() => onPick(n)}
                  aria-label={
                    ocupados.has(n)
                      ? `Asiento ${n} ocupado`
                      : `Asiento ${n}${selected === n ? ' (seleccionado)' : ''}`
                  }
                  className={cn(
                    'flex size-9 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
                    ocupados.has(n)
                      ? 'cursor-not-allowed border-red-300 bg-red-500/15 text-red-600 dark:border-red-900 dark:text-red-400'
                      : selected === n
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-teal-300 bg-teal-500/10 text-teal-700 hover:bg-teal-500/25 dark:border-teal-800 dark:text-teal-400'
                  )}
                >
                  {n}
                </button>
              )
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm border border-teal-300 bg-teal-500/10 dark:border-teal-800" />
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm border border-blue-500 bg-blue-500" />
          Seleccionado
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm border border-red-300 bg-red-500/15 dark:border-red-900" />
          Ocupado
        </span>
      </div>
    </div>
  )
}
