'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { guardarTarifaPlataforma } from './actions'

/** % general que Ketzal cobra por venta del MARKETPLACE (channel='portal').
 *  Las ventas del back-office no pagan corte — lo gatea `tg_commission_snapshot`.
 *  Este valor vive en `app_settings` y es el que usa el motor cuando el viaje no
 *  tiene un % propio; hasta b080 había además una regla global en
 *  `commission_rules` que lo pisaba en silencio y dejaba este control sin efecto. */
export function TasaPlataformaForm({ initialRate }: { initialRate: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rate, setRate] = useState(String(initialRate))

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = Number(rate)
    if (rate.trim() === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('El porcentaje debe estar entre 0 y 100.')
      return
    }

    startTransition(async () => {
      const result = await guardarTarifaPlataforma(parsed)
      if ('error' in result) {
        setError(result.error)
      } else {
        toast.success('Tasa de plataforma actualizada')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.5"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          aria-label="Porcentaje de comisión de plataforma"
          className="w-24 pr-7 text-right tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
          %
        </span>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? 'Guardando…' : 'Guardar'}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </form>
  )
}
