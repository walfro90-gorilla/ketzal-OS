'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPinIcon, ChevronDownIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PublicServiceCard } from './data'

// Vitrina navegable: búsqueda + filtros por destino (estado) y tipo, en memoria
// (el catálogo público cabe completo en el cliente; cero round-trips). Las
// opciones se derivan de los datos y un filtro con ≤1 opción se oculta.

const TIPO_LABELS: Record<string, string> = {
  tour: 'Tour',
  paquete: 'Paquete',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  actividad: 'Actividad',
}
const tipoLabel = (t: string) =>
  TIPO_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1)

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

/** Minúsculas y sin acentos: "Creel" ≡ "creel". */
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

function destino(city: string | null, state: string | null): string | null {
  const partes = [city, state].filter(Boolean)
  return partes.length ? partes.join(', ') : null
}

// Mismo <select> nativo que en las listas de ops (picker del SO en móvil).
const selectClass =
  'h-11 md:h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-3 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative w-full sm:w-48">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">Todos — {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export function Catalogo({ servicios }: { servicios: PublicServiceCard[] }) {
  const [query, setQuery] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')

  // Opciones derivadas de los datos (distintos, ordenados).
  const estadoOpts = useMemo(() => {
    const set = new Set(servicios.map((s) => s.state_to).filter(Boolean) as string[])
    return [...set].sort((a, b) => a.localeCompare(b, 'es')).map((v) => ({ value: v, label: v }))
  }, [servicios])
  const tipoOpts = useMemo(() => {
    const set = new Set(servicios.map((s) => s.service_type).filter(Boolean) as string[])
    return [...set].sort().map((v) => ({ value: v, label: tipoLabel(v) }))
  }, [servicios])

  const filtrados = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean)
    return servicios.filter((s) => {
      if (estado && s.state_to !== estado) return false
      if (tipo && s.service_type !== tipo) return false
      if (tokens.length) {
        const heno = normalize(
          [s.name, s.city_to, s.state_to, s.location, s.agency].filter(Boolean).join(' ')
        )
        if (!tokens.every((t) => heno.includes(t))) return false
      }
      return true
    })
  }, [servicios, query, estado, tipo])

  const clear = () => {
    setQuery('')
    setEstado('')
    setTipo('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="search"
          inputMode="search"
          aria-label="Buscar viajes"
          placeholder="Buscar destino, tour, agencia…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        {estadoOpts.length > 1 && (
          <Select label="Destino" value={estado} onChange={setEstado} options={estadoOpts} />
        )}
        {tipoOpts.length > 1 && (
          <Select label="Tipo" value={tipo} onChange={setTipo} options={tipoOpts} />
        )}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtrados.length === 1 ? '1 viaje' : `${filtrados.length} viajes`}
      </p>

      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún viaje coincide con tu búsqueda.
          </p>
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((s) => {
            const lugar = destino(s.city_to, s.state_to) ?? s.location
            return (
              <Link key={s.id} href={`/servicio/${s.id}`} className="group">
                <Card className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">
                  <div className="aspect-[3/2] w-full overflow-hidden bg-muted">
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.image}
                        alt={s.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <MapPinIcon className="size-8" />
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-1 p-4">
                    <h2 className="line-clamp-2 font-semibold">{s.name}</h2>
                    {lugar && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5" />
                        {lugar}
                      </p>
                    )}
                    <p className="pt-1 text-sm">
                      <span className="text-muted-foreground">Desde </span>
                      <span className="font-semibold tabular-nums">
                        {mxn.format(Number(s.price ?? 0))}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{s.agency}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
