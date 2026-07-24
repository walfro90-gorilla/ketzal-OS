'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { mxn } from '@/components/data/format'
import { guardarReglaPlataforma, type ReglaBasis } from './reglas-actions'

export type ReglaServicio = {
  serviceId: string
  nombre: string
  agencia: string | null
  basis: ReglaBasis
  value: number | null
}

const BASIS_LABEL: Record<ReglaBasis, string> = {
  global: 'Usar % global',
  percent: '% propio',
  fijo_venta: 'Fijo por venta',
  fijo_pax: 'Fijo por pasajero',
}

/** Resumen legible de la regla vigente (columna de la izquierda). */
function resumen(basis: ReglaBasis, value: number | null, globalRate: number): string {
  if (basis === 'percent') return `${value}%`
  if (basis === 'fijo_venta') return `${mxn.format(Number(value ?? 0))} por venta`
  if (basis === 'fijo_pax') return `${mxn.format(Number(value ?? 0))} por pasajero`
  return `Global (${globalRate}%)`
}

function ReglaRow({
  regla,
  globalRate,
  showAgencia,
}: {
  regla: ReglaServicio
  globalRate: number
  showAgencia: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [basis, setBasis] = useState<ReglaBasis>(regla.basis)
  const [value, setValue] = useState(regla.value != null ? String(regla.value) : '')
  const [error, setError] = useState<string | null>(null)
  // Vigente = lo último guardado; se recalcula al confirmar.
  const [saved, setSaved] = useState<{ basis: ReglaBasis; value: number | null }>({
    basis: regla.basis,
    value: regla.value,
  })

  const needsValue = basis === 'percent' || basis === 'fijo_venta' || basis === 'fijo_pax'
  const isPct = basis === 'percent'

  function handleSave() {
    setError(null)
    const parsed = needsValue ? Number(value) : null
    startTransition(async () => {
      const result = await guardarReglaPlataforma(
        regla.serviceId,
        basis,
        needsValue ? parsed : null
      )
      if ('error' in result) {
        setError(result.error)
      } else {
        setSaved({ basis, value: needsValue ? parsed : null })
        toast.success('Regla actualizada')
      }
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{regla.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {showAgencia && regla.agencia ? `${regla.agencia} · ` : ''}
          Ketzal gana: {resumen(saved.basis, saved.value, globalRate)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={basis}
          onChange={(e) => setBasis(e.target.value as ReglaBasis)}
          aria-label="Cómo gana Ketzal por este servicio"
          className="w-40"
        >
          {(Object.keys(BASIS_LABEL) as ReglaBasis[]).map((b) => (
            <option key={b} value={b}>
              {BASIS_LABEL[b]}
            </option>
          ))}
        </NativeSelect>

        {needsValue && (
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={isPct ? 100 : undefined}
              step={isPct ? '0.5' : '1'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Valor de la regla"
              className="w-28 pr-7 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
              {isPct ? '%' : '$'}
            </span>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </li>
  )
}

/** Editor de "cuánto gana Ketzal por servicio" (override del % global). */
export function ReglasServicio({
  reglas,
  globalRate,
  showAgencia,
}: {
  reglas: ReglaServicio[]
  globalRate: number
  showAgencia: boolean
}) {
  if (reglas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay servicios para configurar.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {reglas.map((r) => (
        <ReglaRow
          key={r.serviceId}
          regla={r}
          globalRate={globalRate}
          showAgencia={showAgencia}
        />
      ))}
    </ul>
  )
}
