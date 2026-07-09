'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  actualizarServicio,
  crearServicio,
  type ItineraryDay,
  type ServicioInput,
} from './actions'

// Estilo de <textarea> nativo alineado al Input de shadcn (no hay Textarea en components/ui).
const textareaClass =
  'min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

// Estilo de <select> nativo alineado al Input de shadcn (no hay Select en components/ui).
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

const TIPO_OPCIONES = [
  { value: 'tour', label: 'Tour' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'hospedaje', label: 'Hospedaje' },
  { value: 'actividad', label: 'Actividad' },
] as const

type ServicioTipo = (typeof TIPO_OPCIONES)[number]['value'] | ''

/** Acota el service_type de la BD a las opciones del select. */
function normalizarTipo(tipo: string | null | undefined): ServicioTipo {
  const conocido = TIPO_OPCIONES.find((opcion) => opcion.value === tipo)
  return conocido ? conocido.value : ''
}

/** Separa el textarea en conceptos: una línea por concepto, sin vacíos. */
function separarLineas(texto: string): string[] {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)
}

export type ServicioFormInitial = {
  name: string
  supplier_id: string
  description: string
  price: number
  service_type: string | null
  state_from: string
  city_from: string
  state_to: string
  city_to: string
  max_capacity: number | null
  /** Fecha YYYY-MM-DD (ya recortada) o ''. */
  available_from: string
  available_to: string
  /** Conceptos unidos por salto de línea. */
  includes: string
  excludes: string
  /** Itinerario día por día. */
  itinerary: ItineraryDay[]
}

export function ServicioForm({
  servicioId,
  agencias,
  defaultSupplierId,
  initial,
}: {
  /** Si viene, el formulario edita (actualizarServicio); si no, crea (crearServicio). */
  servicioId?: string
  /** Agencias (suppliers type='agency') para el select de dueña. */
  agencias: { id: string; name: string }[]
  /** Agencia del usuario, para preseleccionarla al crear. */
  defaultSupplierId?: string
  initial?: ServicioFormInitial
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [name, setName] = useState(initial?.name ?? '')
  const [supplierId, setSupplierId] = useState(
    initial?.supplier_id ?? defaultSupplierId ?? agencias[0]?.id ?? ''
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(
    initial ? String(initial.price) : ''
  )
  const [tipo, setTipo] = useState<ServicioTipo>(
    initial ? normalizarTipo(initial.service_type) : 'tour'
  )
  const [stateFrom, setStateFrom] = useState(initial?.state_from ?? '')
  const [cityFrom, setCityFrom] = useState(initial?.city_from ?? '')
  const [stateTo, setStateTo] = useState(initial?.state_to ?? '')
  const [cityTo, setCityTo] = useState(initial?.city_to ?? '')
  const [maxCapacity, setMaxCapacity] = useState(
    initial?.max_capacity != null ? String(initial.max_capacity) : ''
  )
  const [availableFrom, setAvailableFrom] = useState(
    initial?.available_from ?? ''
  )
  const [availableTo, setAvailableTo] = useState(initial?.available_to ?? '')
  const [includesText, setIncludesText] = useState(initial?.includes ?? '')
  const [excludesText, setExcludesText] = useState(initial?.excludes ?? '')
  const [itinerary, setItinerary] = useState<ItineraryDay[]>(
    initial?.itinerary ?? []
  )

  function agregarDia() {
    setItinerary((prev) => [...prev, { title: '', description: '' }])
  }
  function quitarDia(indice: number) {
    setItinerary((prev) => prev.filter((_, i) => i !== indice))
  }
  function actualizarDia(indice: number, patch: Partial<ItineraryDay>) {
    setItinerary((prev) =>
      prev.map((dia, i) => (i === indice ? { ...dia, ...patch } : dia))
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!name.trim()) {
      setError('Escribe el nombre del servicio.')
      return
    }
    if (!supplierId) {
      setError('Selecciona la agencia dueña del servicio.')
      return
    }

    const precio = Number(price)
    if (price.trim() === '' || !Number.isFinite(precio) || precio < 0) {
      setError('El precio debe ser un número mayor o igual a 0.')
      return
    }

    let cupo: number | undefined
    if (maxCapacity.trim() !== '') {
      const cupoNum = Number(maxCapacity)
      if (!Number.isFinite(cupoNum) || cupoNum < 1) {
        setError('El cupo máximo debe ser un entero mayor a 0.')
        return
      }
      cupo = Math.trunc(cupoNum)
    }

    const input: ServicioInput = {
      name: name.trim(),
      supplier_id: supplierId,
      description: description.trim() || undefined,
      price: precio,
      service_type: tipo || undefined,
      state_from: stateFrom.trim() || undefined,
      city_from: cityFrom.trim() || undefined,
      state_to: stateTo.trim() || undefined,
      city_to: cityTo.trim() || undefined,
      max_capacity: cupo,
      available_from: availableFrom || undefined,
      available_to: availableTo || undefined,
      includes: separarLineas(includesText),
      excludes: separarLineas(excludesText),
      itinerary,
    }

    startTransition(async () => {
      if (servicioId) {
        const result = await actualizarServicio(servicioId, input)
        if ('error' in result) setError(result.error)
        else setSaved(true)
      } else {
        // En éxito la acción redirige a /servicios/[id]; solo llega aquí con error.
        const result = await crearServicio(input)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos del servicio</CardTitle>
          <CardDescription>
            El nombre, la agencia dueña y el precio son obligatorios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-nombre">Nombre *</Label>
              <Input
                id="servicio-nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Tour Médanos de Samalayuca"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-agencia">Agencia (dueña) *</Label>
              <select
                id="servicio-agencia"
                className={selectClass}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                {agencias.length === 0 && (
                  <option value="">No hay agencias registradas</option>
                )}
                {agencias.map((agencia) => (
                  <option key={agencia.id} value={agencia.id}>
                    {agencia.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-tipo">Tipo de servicio</Label>
              <select
                id="servicio-tipo"
                className={selectClass}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ServicioTipo)}
              >
                {TIPO_OPCIONES.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-descripcion">Descripción</Label>
              <textarea
                id="servicio-descripcion"
                className={textareaClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué incluye la experiencia, duración… (opcional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-precio">Precio (MXN) *</Label>
              <Input
                id="servicio-precio"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ej. 1500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-cupo">Cupo máximo</Label>
              <Input
                id="servicio-cupo"
                type="number"
                inputMode="numeric"
                min={1}
                step="1"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                placeholder="Ej. 40 (opcional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-estado-origen">Origen — estado</Label>
              <Input
                id="servicio-estado-origen"
                value={stateFrom}
                onChange={(e) => setStateFrom(e.target.value)}
                placeholder="Ej. Chihuahua"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-ciudad-origen">Origen — ciudad</Label>
              <Input
                id="servicio-ciudad-origen"
                value={cityFrom}
                onChange={(e) => setCityFrom(e.target.value)}
                placeholder="Ej. Ciudad Juárez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-estado-destino">Destino — estado</Label>
              <Input
                id="servicio-estado-destino"
                value={stateTo}
                onChange={(e) => setStateTo(e.target.value)}
                placeholder="Ej. Chihuahua"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-ciudad-destino">Destino — ciudad</Label>
              <Input
                id="servicio-ciudad-destino"
                value={cityTo}
                onChange={(e) => setCityTo(e.target.value)}
                placeholder="Ej. Creel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-disponible-desde">
                Disponible desde
              </Label>
              <Input
                id="servicio-disponible-desde"
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-disponible-hasta">
                Disponible hasta
              </Label>
              <Input
                id="servicio-disponible-hasta"
                type="date"
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-incluye">Incluye</Label>
              <textarea
                id="servicio-incluye"
                className={textareaClass}
                value={includesText}
                onChange={(e) => setIncludesText(e.target.value)}
                placeholder={'Una línea por concepto. Ej.\nTransporte redondo\nDesayuno'}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-no-incluye">No incluye</Label>
              <textarea
                id="servicio-no-incluye"
                className={textareaClass}
                value={excludesText}
                onChange={(e) => setExcludesText(e.target.value)}
                placeholder={'Una línea por concepto. Ej.\nPropinas\nComidas no especificadas'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itinerario</CardTitle>
          <CardDescription>
            Día por día (opcional). Se muestra en la cotización que envías al
            cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {itinerary.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin días todavía. Agrega el primero.
            </p>
          )}
          {itinerary.map((dia, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Día {i + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => quitarDia(i)}
                >
                  Quitar
                </Button>
              </div>
              <Input
                value={dia.title}
                onChange={(e) => actualizarDia(i, { title: e.target.value })}
                placeholder="Título del día. Ej. Llegada a Creel y recorrido"
              />
              <textarea
                className={textareaClass}
                value={dia.description}
                onChange={(e) =>
                  actualizarDia(i, { description: e.target.value })
                }
                placeholder="Qué se hace ese día… (opcional)"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={agregarDia}
          >
            + Agregar día
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? 'Guardando…'
            : servicioId
              ? 'Guardar cambios'
              : 'Guardar servicio'}
        </Button>
        {saved && (
          <span
            role="status"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Guardado ✓
          </span>
        )}
      </div>
    </form>
  )
}
