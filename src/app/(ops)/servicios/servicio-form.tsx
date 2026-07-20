'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
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
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  actualizarServicio,
  crearServicio,
  setServicioPublicado,
  type ItineraryDay,
  type ServicioInput,
} from './actions'
import { PACK_TYPES, type Pack, type PackInput } from '@/lib/domain/packs'
import { ImportarArchivo } from './importar-archivo'
import { ImportarUrl } from './importar-url'
import type { ServicioLeido } from '@/lib/ai/servicio-leido'

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
  /** Paquetes por ocupación (solo tours/paquetes). */
  packs: Pack[]
  /** Si está en el catálogo público (marketplace). */
  published: boolean
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
  // Precios por ocupación como strings (uno por tipo); vacío = no se ofrece.
  const [packPrices, setPackPrices] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of initial?.packs ?? []) m[p.key] = String(p.price)
    return m
  })
  // Publicación en el catálogo público. Al editar se persiste al instante
  // (acción propia, independiente de "Guardar cambios"); al crear queda de
  // solo lectura hasta que el servicio exista.
  const [published, setPublished] = useState(initial?.published ?? false)
  const [publishing, startPublishing] = useTransition()

  // Los paquetes por ocupación solo aplican a tours y paquetes.
  const muestraPaquetes = tipo === 'tour' || tipo === 'paquete'

  function togglePublicado(next: boolean) {
    if (!servicioId) return
    setPublished(next) // optimista: se revierte si la acción falla
    startPublishing(async () => {
      const res = await setServicioPublicado(servicioId, next)
      if ('error' in res) {
        setPublished(!next)
        toast.error(res.error)
      } else {
        toast.success(next ? 'Servicio publicado' : 'Servicio ocultado')
      }
    })
  }

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

  /**
   * Vuelca lo leído de un PDF/imagen en los campos. Solo pisa lo que el
   * lector sí encontró: las claves ausentes no llegan (ver `normalizarLeido`),
   * así que un segundo archivo completa en vez de borrar lo ya capturado.
   * La agencia dueña NUNCA se toca: es decisión del agente, no del archivo.
   */
  function aplicarLeido(d: ServicioLeido) {
    if (d.name) setName(d.name)
    if (d.description) setDescription(d.description)
    if (d.price != null) setPrice(String(d.price))
    const tipoLeido = normalizarTipo(d.service_type)
    if (tipoLeido) setTipo(tipoLeido)
    if (d.state_from) setStateFrom(d.state_from)
    if (d.city_from) setCityFrom(d.city_from)
    if (d.state_to) setStateTo(d.state_to)
    if (d.city_to) setCityTo(d.city_to)
    if (d.max_capacity != null) setMaxCapacity(String(d.max_capacity))
    if (d.available_from) setAvailableFrom(d.available_from)
    if (d.available_to) setAvailableTo(d.available_to)
    if (d.includes?.length) setIncludesText(d.includes.join('\n'))
    if (d.excludes?.length) setExcludesText(d.excludes.join('\n'))
    if (d.itinerary?.length) setItinerary(d.itinerary)
    if (d.packs) {
      const leidos = Object.fromEntries(
        Object.entries(d.packs).map(([k, v]) => [k, String(v)])
      )
      setPackPrices((prev) => ({ ...prev, ...leidos }))
    }
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

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

    // Paquetes: solo para tours/paquetes; toma los que tienen precio válido.
    const packs: PackInput[] = []
    if (muestraPaquetes) {
      for (const t of PACK_TYPES) {
        const raw = packPrices[t.key]?.trim()
        if (!raw) continue
        const p = Number(raw)
        if (!Number.isFinite(p) || p < 0) {
          setError(`El precio de "${t.label}" debe ser un número mayor o igual a 0.`)
          return
        }
        packs.push({ key: t.key, price: p })
      }
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
      packs,
    }

    startTransition(async () => {
      if (servicioId) {
        const result = await actualizarServicio(servicioId, input)
        if ('error' in result) setError(result.error)
        else toast.success('Servicio actualizado')
      } else {
        // En éxito la acción redirige a /servicios/[id]; solo llega aquí con error.
        const result = await crearServicio(input)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Solo al crear: editando, el atajo confundiría más de lo que ayuda. */}
      {!servicioId && (
        <>
          <ImportarArchivo onDatos={aplicarLeido} />
          <ImportarUrl onDatos={aplicarLeido} />
        </>
      )}

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
              <NativeSelect
                id="servicio-agencia"
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
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="servicio-tipo">Tipo de servicio</Label>
              <NativeSelect
                id="servicio-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ServicioTipo)}
              >
                {TIPO_OPCIONES.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-descripcion">Descripción</Label>
              <Textarea
                id="servicio-descripcion"
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
              <Textarea
                id="servicio-incluye"
                value={includesText}
                onChange={(e) => setIncludesText(e.target.value)}
                placeholder={'Una línea por concepto. Ej.\nTransporte redondo\nDesayuno'}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-no-incluye">No incluye</Label>
              <Textarea
                id="servicio-no-incluye"
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
              <Textarea
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

      {muestraPaquetes && (
        <Card>
          <CardHeader>
            <CardTitle>Paquetes por ocupación</CardTitle>
            <CardDescription>
              Precio por persona según el tipo de habitación. Deja en blanco los
              que no ofrezcas. Es solo precio: el cupo se controla en las salidas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PACK_TYPES.map((t) => (
              <div
                key={t.key}
                className="grid grid-cols-[1fr_auto] items-center gap-3"
              >
                <Label htmlFor={`pack-${t.key}`}>{t.label}</Label>
                <Input
                  id={`pack-${t.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  className="w-40"
                  value={packPrices[t.key] ?? ''}
                  onChange={(e) =>
                    setPackPrices((prev) => ({ ...prev, [t.key]: e.target.value }))
                  }
                  placeholder="Precio p/persona"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Publicación</CardTitle>
          <CardDescription>
            Un servicio público aparece en el catálogo del sitio; uno privado
            solo lo ven tu agencia y tú para venderlo directo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="servicio-publicado" className="cursor-pointer">
                {published ? 'Público' : 'Privado'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {!servicioId
                  ? 'Guarda el servicio primero; después podrás publicarlo.'
                  : published
                    ? 'Visible en el catálogo público.'
                    : 'Oculto del catálogo público.'}
              </p>
            </div>
            <Switch
              id="servicio-publicado"
              checked={published}
              onCheckedChange={togglePublicado}
              disabled={!servicioId || publishing}
              aria-label={
                published
                  ? 'Quitar del catálogo público'
                  : 'Publicar en el catálogo'
              }
            />
          </div>
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
      </div>
    </form>
  )
}
