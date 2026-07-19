'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type PresetRango = { label: string; from: string; to: string }

/**
 * Filtro de periodo del panel: presets como chips (links, sin JS) y rango
 * custom desde/hasta. Una sola fila arriba de todo lo que filtra; el resumen
 * completo se re-renderiza contra el mismo rango.
 */
export function RangoPanel({
  presets,
  from,
  to,
}: {
  presets: PresetRango[]
  from: string
  to: string
}) {
  const router = useRouter()
  const [desde, setDesde] = useState(from)
  const [hasta, setHasta] = useState(to)
  const presetActivo = presets.find((p) => p.from === from && p.to === to)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!desde || !hasta) return
    router.push(`/dashboard?from=${desde}&to=${hasta}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div
        role="group"
        aria-label="Periodos rápidos"
        className="flex flex-wrap gap-1.5"
      >
        {presets.map((p) => {
          const activo = presetActivo?.label === p.label
          return (
            <Link
              key={p.label}
              href={`/dashboard?from=${p.from}&to=${p.to}`}
              aria-current={activo ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
                activo
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p.label}
            </Link>
          )
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3"
        aria-label="Rango de fechas personalizado"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="panel-desde" className="text-xs">
            Desde
          </Label>
          <Input
            id="panel-desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="panel-hasta" className="text-xs">
            Hasta
          </Label>
          <Input
            id="panel-hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <Button type="submit" variant="outline" className="h-9">
          Aplicar
        </Button>
      </form>
    </div>
  )
}
