'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPinIcon, SlidersHorizontalIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { BrandMark } from '@/components/brand-mark'
import { tituloVisible } from '@/lib/display-title'
import { destino, mxn } from '@/components/data/format'
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


/** Minúsculas y sin acentos: "Creel" ≡ "creel". */
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

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

export function Catalogo({
  servicios,
  agenciaIds,
  refCode,
}: {
  servicios: PublicServiceCard[]
  /** Mapa nombre de agencia → id, para enlazar al perfil público. */
  agenciaIds: Record<string, string>
  /** Código de referido del embajador (?ref): se propaga a la ficha para que
   *  sobreviva hasta /comprar y atribuya la venta. */
  refCode?: string
}) {
  const refQs = refCode ? `?ref=${encodeURIComponent(refCode)}` : ''
  const [query, setQuery] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [orden, setOrden] = useState('nombre')
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [filtrosOpen, setFiltrosOpen] = useState(false)

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
    const min = precioMin.trim() ? Number(precioMin) : null
    const max = precioMax.trim() ? Number(precioMax) : null
    return servicios.filter((s) => {
      if (estado && s.state_to !== estado) return false
      if (tipo && s.service_type !== tipo) return false
      const precio = Number(s.price ?? 0)
      if (min != null && Number.isFinite(min) && precio < min) return false
      if (max != null && Number.isFinite(max) && precio > max) return false
      if (tokens.length) {
        const heno = normalize(
          [s.name, s.city_to, s.state_to, s.location, s.agency].filter(Boolean).join(' ')
        )
        if (!tokens.every((t) => heno.includes(t))) return false
      }
      return true
    })
  }, [servicios, query, estado, tipo, precioMin, precioMax])

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
    setPrecioMin('')
    setPrecioMax('')
  }

  const hayFiltros = Boolean(
    query || estado || tipo || precioMin || precioMax
  )
  // Filtros "avanzados" = todo menos la búsqueda (esa siempre está a la vista).
  // Cuentan para el badge del botón "Filtros" en móvil.
  const numFiltrosAvanzados = [estado, tipo, precioMin, precioMax].filter(Boolean).length

  const controlesAvanzados = (
    <>
      {estadoOpts.length > 1 && (
        <Select label="Destino" value={estado} onChange={setEstado} options={estadoOpts} />
      )}
      {tipoOpts.length > 1 && (
        <Select label="Tipo" value={tipo} onChange={setTipo} options={tipoOpts} />
      )}
      {servicios.length > 1 && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            aria-label="Precio mínimo"
            placeholder="Mín $"
            value={precioMin}
            onChange={(e) => setPrecioMin(e.target.value)}
            min={0}
            className="w-24"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            aria-label="Precio máximo"
            placeholder="Máx $"
            value={precioMax}
            onChange={(e) => setPrecioMax(e.target.value)}
            min={0}
            className="w-24"
          />
        </div>
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
    </>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex gap-2">
          <Input
            type="search"
            inputMode="search"
            aria-label="Buscar viajes"
            placeholder="Buscar destino, tour, agencia…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 sm:max-w-xs"
          />
          {/* Móvil: destino/tipo/precio/orden viven en un Sheet — 5 controles
              apilados empujaban los resultados fuera de la pantalla inicial. */}
          <Button
            type="button"
            variant="outline"
            className="shrink-0 sm:hidden"
            onClick={() => setFiltrosOpen(true)}
          >
            <SlidersHorizontalIcon className="size-4" />
            Filtros{numFiltrosAvanzados > 0 ? ` (${numFiltrosAvanzados})` : ''}
          </Button>
        </div>
        <div className="mt-2 hidden gap-2 sm:flex sm:flex-wrap sm:items-center">
          {controlesAvanzados}
        </div>
      </div>

      <Sheet open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {controlesAvanzados}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={clear}>
                Limpiar
              </Button>
              <Button type="button" className="flex-1" onClick={() => setFiltrosOpen(false)}>
                Ver {ordenados.length === 1 ? '1 viaje' : `${ordenados.length} viajes`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hayFiltros
            ? `${ordenados.length} de ${servicios.length} viajes`
            : ordenados.length === 1
              ? '1 viaje'
              : `${ordenados.length} viajes`}
        </p>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

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
            const lugar = destino(s)
            const agenciaId = agenciaIds[s.agency]
            return (
              // Card como contenedor (no Link): el cuerpo enlaza al servicio y la
              // agencia es un link aparte → sin anidar <a> dentro de <a>.
              <Card
                key={s.id}
                className="flex h-full flex-col overflow-hidden py-0 transition-shadow hover:shadow-md"
              >
                <Link
                  href={`/servicio/${s.id}${refQs}`}
                  className="group flex flex-1 flex-col"
                >
                  <div className="relative aspect-[3/2] w-full overflow-hidden bg-muted">
                    {s.service_type && (
                      <span className="absolute left-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
                        {tipoLabel(s.service_type)}
                      </span>
                    )}
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.image}
                        alt={s.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary/60">
                        <BrandMark className="size-10" />
                      </div>
                    )}
                    {/* Precio generado por el sistema, siempre — nunca depende de
                        que el flyer que subió la agencia lo traiga quemado. */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-2 pl-3">
                      <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm backdrop-blur">
                        Desde {mxn.format(Number(s.price ?? 0))}
                      </span>
                    </div>
                  </div>
                  <CardContent className="flex-1 space-y-1 p-4 pb-2">
                    <h2 className="font-display line-clamp-2 font-semibold tracking-[-0.01em] group-hover:text-primary">
                      {tituloVisible(s.name)}
                    </h2>
                    {lugar && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5" />
                        {lugar}
                      </p>
                    )}
                    <p className="flex items-baseline gap-1 pt-1 text-sm">
                      <span className="text-muted-foreground">Desde</span>
                      <span className="font-display text-base font-semibold tabular-nums">
                        {mxn.format(Number(s.price ?? 0))}
                      </span>
                    </p>
                  </CardContent>
                </Link>
                <div className="px-4 pb-4">
                  {agenciaId ? (
                    <Link
                      href={`/agencia/${agenciaId}`}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {s.agency}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {s.agency}
                    </span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
