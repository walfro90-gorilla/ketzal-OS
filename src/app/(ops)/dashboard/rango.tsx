'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    <div className="-mx-1 flex items-end gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="group"
        aria-label="Periodos rápidos"
        className="flex shrink-0 gap-1.5"
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
        className="flex shrink-0 items-end gap-2"
        aria-label="Rango de fechas personalizado"
      >
        <Input
          id="panel-desde"
          type="date"
          aria-label="Desde"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => setDesde(e.target.value)}
          className="h-9 w-[8.5rem] shrink-0"
        />
        <span aria-hidden className="pb-2 text-sm text-muted-foreground">
          –
        </span>
        <Input
          id="panel-hasta"
          type="date"
          aria-label="Hasta"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => setHasta(e.target.value)}
          className="h-9 w-[8.5rem] shrink-0"
        />
        {/* Ícono en vez de "Aplicar": en una sola fila el ancho es el recurso
            escaso. `aria-label` y `title` conservan el nombre accesible — un
            botón que solo dice 🔍 al lector de pantalla no sirve. */}
        <Button
          type="submit"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Aplicar rango de fechas"
          title="Aplicar rango"
        >
          <SearchIcon className="size-4" />
        </Button>
      </form>
    </div>
  )
}
