'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPinIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
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

// Mismo <select> nativo que en las listas de ops (picker del SO en móvil),
// con la API local de este catálogo (label + options → onChange del valor).
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
    <div className="w-full sm:w-48">
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos — {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

const ORDEN_OPCIONES = [
  { value: 'nombre', label: 'Nombre (A–Z)' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
]

export function Catalogo({ servicios }: { servicios: PublicServiceCard[] }) {
  const [query, setQuery] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [orden, setOrden] = useState('nombre')

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

  const ordenados = useMemo(() => {
    const arr = [...filtrados]
    if (orden === 'precio-asc') {
      arr.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0))
    } else if (orden === 'precio-desc') {
      arr.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0))
    } else {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    }
    return arr
  }, [filtrados, orden])

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
        {servicios.length > 1 && (
          <div className="w-full sm:ml-auto sm:w-56">
            <NativeSelect
              aria-label="Ordenar"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            >
              {ORDEN_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {ordenados.length === 1 ? '1 viaje' : `${ordenados.length} viajes`}
      </p>

      {ordenados.length === 0 ? (
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
          {ordenados.map((s) => {
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
