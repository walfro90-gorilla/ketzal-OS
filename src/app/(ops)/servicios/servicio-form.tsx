'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ImageIcon, XIcon } from 'lucide-react'
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
import { CamposUbicacion, type Ubicacion } from '@/components/data/campos-ubicacion'
import { MEXICO, estadoCanonico, paisCanonico } from '@/lib/domain/mexico'
import { Switch } from '@/components/ui/switch'
import { EtiquetasInput } from '@/components/data/etiquetas-input'
import { partirAccion, unirAccion } from '@/lib/domain/itinerario'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  actualizarServicio,
  crearServicio,
  setServicioAlbum,
  setServicioImagen,
  setServicioPublicado,
  setServicioVideo,
  type ItineraryDay,
  type ServicioInput,
} from './actions'
import { subirImagenServicio } from './subir-imagen'
import { videoEmbedUrl } from '@/lib/video'
import { PACK_TYPES, type Pack, type PackInput } from '@/lib/domain/packs'
import type { AddOn, AddOnInput } from '@/lib/domain/addons'
import { ImportarAtajos } from './importar-atajos'
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
  service_type: string | null
  state_from: string
  city_from: string
  country_from?: string | null
  state_to: string
  city_to: string
  country_to?: string | null
  max_capacity: number | null
  /** ADR-0058: días que dura y meses en que conviene venderlo. */
  duration_days?: number | null
  meses_ideales?: number[] | null
  /** Tipo de transporte (b041) o null = sin mapa de asientos. */
  transport_type: string | null
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
  /** Catálogo de add-ons (lista abierta nombre + precio). */
  add_ons: AddOn[]
  /** Si está en el catálogo público (marketplace). */
  published: boolean
  /** URL del banner (foto del catálogo público), o null. */
  banner: string | null
  /** URLs de la galería de fotos (hasta 20). */
  album: string[]
  /** Link de video (YouTube/Vimeo), o null. */
  video: string | null
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Un texto suelto de la IA cae en estado o en país, según qué sea. */
function lugarLeido(texto: string): Partial<Ubicacion> {
  const estado = estadoCanonico(texto)
  if (estado) return { estado, pais: MEXICO }
  const pais = paisCanonico(texto)
  if (pais) return { pais, estado: '' }
  return {}
}

export function ServicioForm({
  servicioId,
  agencias,
  defaultSupplierId,
  initial,
  ciudadesSugeridas = [],
}: {
  /** Si viene, el formulario edita (actualizarServicio); si no, crea (crearServicio). */
  servicioId?: string
  /** Agencias (suppliers type='agency') para el select de dueña. */
  agencias: { id: string; name: string }[]
  /** Agencia del usuario, para preseleccionarla al crear. */
  defaultSupplierId?: string
  initial?: ServicioFormInitial
  /** Ciudades ya usadas, para reusar en vez de inventar (ADR-0057). */
  ciudadesSugeridas?: string[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? '')
  const [supplierId, setSupplierId] = useState(
    initial?.supplier_id ?? defaultSupplierId ?? agencias[0]?.id ?? ''
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [tipo, setTipo] = useState<ServicioTipo>(
    initial ? normalizarTipo(initial.service_type) : 'tour'
  )
  // ADR-0057: origen y destino como ubicación estructurada. El país iba
  // colándose en el campo de estado ("Colombia" junto a "Jalisco"), que es lo
  // que impedía agrupar.
  const [origen, setOrigen] = useState<Ubicacion>({
    ciudad: initial?.city_from ?? '',
    estado: initial?.state_from ?? '',
    pais: initial?.country_from ?? 'México',
  })
  const [destino, setDestino] = useState<Ubicacion>({
    ciudad: initial?.city_to ?? '',
    estado: initial?.state_to ?? '',
    pais: initial?.country_to ?? 'México',
  })
  const [maxCapacity, setMaxCapacity] = useState(
    initial?.max_capacity != null ? String(initial.max_capacity) : ''
  )
  // ADR-0058: duración (decide si una salida cubre un puente) y meses ideales
  // (filtro determinista de qué se sugiere para un hueco).
  const [durationDays, setDurationDays] = useState(
    initial?.duration_days != null ? String(initial.duration_days) : ''
  )
  const [mesesIdeales, setMesesIdeales] = useState<number[]>(initial?.meses_ideales ?? [])
  // b041: tipo de transporte — habilita el mapa de asientos ('' = sin mapa).
  const [transportType, setTransportType] = useState(
    initial?.transport_type ?? ''
  )
  const [availableFrom, setAvailableFrom] = useState(
    initial?.available_from ?? ''
  )
  const [availableTo, setAvailableTo] = useState(initial?.available_to ?? '')
  // Incluye / no incluye como etiquetas (ADR-0043: el valor ya es la lista;
  // `initial` llega como texto con saltos porque así lo arma la página).
  const [includes, setIncludes] = useState<string[]>(() => separarLineas(initial?.includes ?? ''))
  const [excludes, setExcludes] = useState<string[]>(() => separarLineas(initial?.excludes ?? ''))
  const [itinerary, setItinerary] = useState<ItineraryDay[]>(
    initial?.itinerary ?? []
  )
  // Add-ons como renglones editables (nombre + precio en string, como packs).
  const [addOns, setAddOns] = useState<{ label: string; price: string }[]>(
    (initial?.add_ons ?? []).map((a) => ({ label: a.label, price: String(a.price) }))
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
  // Banner (foto del catálogo). La subida es directa a Storage; guardar la URL
  // es una acción propia al instante (como la publicación), en modo edición.
  const [banner, setBanner] = useState(initial?.banner ?? null)
  const [subiendo, startSubiendo] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  // Galería (hasta 20) y video: también persisten al instante en edición.
  const [album, setAlbum] = useState<string[]>(initial?.album ?? [])
  const [subiendoAlbum, startSubiendoAlbum] = useTransition()
  const albumRef = useRef<HTMLInputElement>(null)
  const MAX_FOTOS = 20
  const [video, setVideo] = useState(initial?.video ?? '')
  const [guardandoVideo, startGuardandoVideo] = useTransition()

  // Los paquetes por ocupación solo aplican a tours y paquetes.
  const muestraPaquetes = tipo === 'tour' || tipo === 'paquete'

  // `pendiente` = destino elegido en el toggle, esperando confirmación en el
  // modal. null = sin modal abierto. Publicar/ocultar cambia lo que ve el
  // público, así que se confirma antes de aplicar.
  const [pendiente, setPendiente] = useState<boolean | null>(null)

  function aplicarPublicado(next: boolean) {
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

  function elegirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-elegir el mismo archivo
    if (!file || !servicioId) return
    startSubiendo(async () => {
      const subida = await subirImagenServicio(servicioId, file, 'banner')
      if ('error' in subida) {
        toast.error(subida.error)
        return
      }
      const res = await setServicioImagen(servicioId, subida.url)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setBanner(subida.url)
      toast.success('Imagen actualizada')
    })
  }

  function quitarImagen() {
    if (!servicioId) return
    startSubiendo(async () => {
      const res = await setServicioImagen(servicioId, null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setBanner(null)
      toast.success('Imagen quitada')
    })
  }

  function agregarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length || !servicioId) return
    const espacio = MAX_FOTOS - album.length
    if (espacio <= 0) {
      toast.error(`Máximo ${MAX_FOTOS} fotos.`)
      return
    }
    const aSubir = files.slice(0, espacio)
    startSubiendoAlbum(async () => {
      const nuevas: string[] = []
      for (const f of aSubir) {
        const r = await subirImagenServicio(servicioId, f, 'album')
        if ('error' in r) toast.error(r.error)
        else nuevas.push(r.url)
      }
      if (!nuevas.length) return
      const lista = [...album, ...nuevas]
      const res = await setServicioAlbum(servicioId, lista)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setAlbum(lista)
      toast.success(
        nuevas.length === 1 ? 'Foto agregada' : `${nuevas.length} fotos agregadas`
      )
    })
  }

  function quitarFoto(url: string) {
    if (!servicioId) return
    const lista = album.filter((u) => u !== url)
    startSubiendoAlbum(async () => {
      const res = await setServicioAlbum(servicioId, lista)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setAlbum(lista)
    })
  }

  function guardarVideo() {
    if (!servicioId) return
    const v = video.trim()
    if (v && !videoEmbedUrl(v)) {
      toast.error('El video debe ser un link de YouTube o Vimeo.')
      return
    }
    startGuardandoVideo(async () => {
      const res = await setServicioVideo(servicioId, v || null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success(v ? 'Video guardado' : 'Video quitado')
    })
  }

  // Add-ons: mismo patrón dinámico que el Itinerario (agregar/quitar renglón).
  function agregarAddOn() {
    setAddOns((prev) => [...prev, { label: '', price: '' }])
  }
  function quitarAddOn(indice: number) {
    setAddOns((prev) => prev.filter((_, i) => i !== indice))
  }
  function actualizarAddOn(
    indice: number,
    patch: Partial<{ label: string; price: string }>
  ) {
    setAddOns((prev) =>
      prev.map((a, i) => (i === indice ? { ...a, ...patch } : a))
    )
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
    const tipoLeido = normalizarTipo(d.service_type)
    if (tipoLeido) setTipo(tipoLeido)
    // Lo que lee la IA es texto libre: se pasa por el catálogo para que caiga
    // en el select. Si lo que trae es un país (el bug histórico), se guarda
    // como país, no como estado (ADR-0057).
    if (d.state_from) setOrigen((o) => ({ ...o, ...lugarLeido(d.state_from!) }))
    if (d.city_from) setOrigen((o) => ({ ...o, ciudad: d.city_from! }))
    if (d.state_to) setDestino((x) => ({ ...x, ...lugarLeido(d.state_to!) }))
    if (d.city_to) setDestino((x) => ({ ...x, ciudad: d.city_to! }))
    if (d.max_capacity != null) setMaxCapacity(String(d.max_capacity))
    if (d.available_from) setAvailableFrom(d.available_from)
    if (d.available_to) setAvailableTo(d.available_to)
    if (d.includes?.length) setIncludes(d.includes)
    if (d.excludes?.length) setExcludes(d.excludes)
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

    // Add-ons: renglones con nombre requieren precio > 0; vacíos se ignoran.
    const addOnsInput: AddOnInput[] = []
    for (const a of addOns) {
      const label = a.label.trim()
      const rawPrice = a.price.trim()
      if (!label && !rawPrice) continue
      if (!label) {
        setError('Escribe el nombre del add-on.')
        return
      }
      const p = Number(rawPrice)
      if (!rawPrice || !Number.isFinite(p) || p <= 0) {
        setError(`El precio de "${label}" debe ser un número mayor a 0.`)
        return
      }
      addOnsInput.push({ label, price: p })
    }

    const input: ServicioInput = {
      name: name.trim(),
      supplier_id: supplierId,
      description: description.trim() || undefined,
      service_type: tipo || undefined,
      state_from: origen.estado.trim() || undefined,
      city_from: origen.ciudad.trim() || undefined,
      country_from: origen.pais.trim() || undefined,
      state_to: destino.estado.trim() || undefined,
      city_to: destino.ciudad.trim() || undefined,
      country_to: destino.pais.trim() || undefined,
      max_capacity: cupo,
      duration_days: durationDays.trim() === '' ? undefined : Number(durationDays),
      meses_ideales: mesesIdeales,
      transport_type: transportType || undefined,
      available_from: availableFrom || undefined,
      available_to: availableTo || undefined,
      includes,
      excludes,
      itinerary,
      packs,
      add_ons: addOnsInput,
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

  const estadoPub = !servicioId ? 'borrador' : published ? 'publicado' : 'privado'
  const pillPub =
    estadoPub === 'borrador'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : estadoPub === 'publicado'
        ? 'bg-primary/15 text-primary'
        : 'bg-muted text-muted-foreground'
  const puntoPub =
    estadoPub === 'borrador'
      ? 'bg-amber-500'
      : estadoPub === 'publicado'
        ? 'bg-primary'
        : 'bg-muted-foreground/60'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Estatus de publicación: arriba y siempre visible (sticky). El estado se
          deriva — sin guardar = Borrador; guardado y oculto = Privado; en el
          catálogo = Publicado. El toggle vive aquí, no en una tarjeta al fondo. */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-card px-3 py-2.5 shadow-sm supports-backdrop-filter:bg-card/85 supports-backdrop-filter:backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pillPub}`}
          >
            <span aria-hidden className={`size-1.5 rounded-full ${puntoPub}`} />
            {estadoPub === 'borrador'
              ? 'Borrador'
              : estadoPub === 'publicado'
                ? 'Publicado'
                : 'Privado'}
          </span>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {estadoPub === 'borrador'
              ? 'Aún sin guardar. Guarda para poder publicarlo.'
              : estadoPub === 'publicado'
                ? 'Visible en el catálogo público del sitio.'
                : 'Solo tu agencia lo ve; se vende directo.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="servicio-publicado" className="cursor-pointer text-sm font-medium">
              {published ? 'Público' : 'Privado'}
            </Label>
            <Switch
              id="servicio-publicado"
              checked={published}
              onCheckedChange={(next) => servicioId && setPendiente(next)}
              disabled={!servicioId || publishing}
              aria-label={published ? 'Quitar del catálogo público' : 'Publicar en el catálogo'}
            />
          </div>
          {/* El submit vive aquí, junto al toggle y siempre visible: en un form
              largo el botón del fondo obligaba a bajar para guardar. */}
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Guardando…' : servicioId ? 'Guardar cambios' : 'Guardar servicio'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="basis-full text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Confirmación antes de cambiar lo que ve el público. */}
      <AlertDialog
        open={pendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPendiente(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendiente ? '¿Publicar en el catálogo?' : '¿Volver a privado?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendiente
                ? 'El servicio será visible para cualquier persona en el catálogo público del sitio.'
                : 'El servicio saldrá del catálogo público. Solo tu agencia lo verá para venderlo directo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendiente(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={pendiente ? 'default' : 'secondary'}
              onClick={() => {
                const destino = pendiente
                setPendiente(null)
                if (destino !== null) aplicarPublicado(destino)
              }}
            >
              {pendiente ? 'Sí, publicar' : 'Sí, volver a privado'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Solo al crear: editando, el atajo confundiría más de lo que ayuda.
          Colapsados por defecto (ImportarAtajos), para no comerse el arranque. */}
      {!servicioId && <ImportarAtajos onDatos={aplicarLeido} />}

      <Card id="identidad" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>
            Cómo se llama, de quién es y qué es. El nombre y la agencia dueña son obligatorios.
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
          </div>
        </CardContent>
      </Card>

      <Card id="ruta" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Ruta y fechas</CardTitle>
          <CardDescription>
            De dónde sale, a dónde va y cuándo se puede vender. La duración y los meses ideales alimentan el calendario de huecos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="text-sm font-medium">De dónde sale</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <CamposUbicacion
                  valor={origen}
                  onChange={setOrigen}
                  ciudadesSugeridas={ciudadesSugeridas}
                />
              </div>
            </fieldset>
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="text-sm font-medium">A dónde va</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <CamposUbicacion
                  valor={destino}
                  onChange={setDestino}
                  ciudadesSugeridas={ciudadesSugeridas}
                />
              </div>
            </fieldset>
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
            <div className="space-y-2">
              <Label htmlFor="servicio-duracion">Duración (días)</Label>
              <Input
                id="servicio-duracion"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="Ej. 3 (vacío = 1)"
              />
              <p className="text-xs text-muted-foreground">
                Con la duración, el calendario de huecos sabe si una salida del
                viernes cubre el puente del lunes.
              </p>
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Meses ideales</legend>
              <p className="text-xs text-muted-foreground">
                Marca en qué meses conviene venderlo; así no se sugiere en
                temporada de lluvias o de calor. Sin marcar = todo el año.
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {MESES.map((nombre, i) => {
                  const mes = i + 1
                  const marcado = mesesIdeales.includes(mes)
                  return (
                    <label
                      key={mes}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={marcado}
                        onChange={() =>
                          setMesesIdeales((prev) =>
                            marcado ? prev.filter((m) => m !== mes) : [...prev, mes].sort((a, b) => a - b)
                          )
                        }
                      />
                      {nombre}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </div>
        </CardContent>
      </Card>

      <Card id="capacidad" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Capacidad y transporte</CardTitle>
          <CardDescription>
            Cuánta gente cabe y en qué se viaja. El transporte define el mapa de asientos que ve el pasajero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="servicio-transporte">Transporte (mapa de asientos)</Label>
              <NativeSelect
                id="servicio-transporte"
                value={transportType}
                onChange={(e) => setTransportType(e.target.value)}
              >
                <option value="">Sin mapa de asientos</option>
                <option value="autobus">Autobús (2+2)</option>
                <option value="sprinter">Sprinter (1+2)</option>
                <option value="van">Van (1+2)</option>
                <option value="avion">Avión (3+3)</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Con transporte, los viajeros eligen asiento; el total de
                asientos = cupo de cada salida.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="incluye" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Qué incluye</CardTitle>
          <CardDescription>
            Lo que el precio cubre y lo que no. Aparece tal cual en la cotización y en la ficha pública.
            Escribe un concepto y presiona <kbd className="rounded border px-1">Enter</kbd> o coma para
            agregarlo; <kbd className="rounded border px-1">Retroceso</kbd> quita el último. También puedes
            pegar una lista separada por comas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-incluye">Incluye</Label>
              <EtiquetasInput
                id="servicio-incluye"
                valor={includes}
                onChange={setIncludes}
                placeholder="Ej. Transporte redondo, desayuno, guía certificado"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="servicio-no-incluye">No incluye</Label>
              <EtiquetasInput
                id="servicio-no-incluye"
                valor={excludes}
                onChange={setExcludes}
                placeholder="Ej. Propinas, comidas no especificadas, seguro de viaje"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="itinerario" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Itinerario</CardTitle>
          <CardDescription>
            Día por día (opcional). Se muestra en la cotización que envías al
            cliente. La hora de cada acción es opcional; el día de la semana no
            se captura aquí: sale solo de la fecha de cada salida en la
            cotización y el voucher.
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
              {/* Varias acciones por día: una por renglón. Se guardan en
                  `description` separadas por salto de línea, así ningún render
                  (cotización, mis-compras) necesita cambiar de forma. */}
              {(dia.description ? dia.description.split('\n') : ['']).map(
                (accion, j, lineas) => {
                  // La hora vive como prefijo "07:00 · texto" del mismo renglón.
                  const { hora, texto } = partirAccion(accion)
                  const poner = (a: { hora: string; texto: string }) => {
                    const next = [...lineas]
                    next[j] = unirAccion(a)
                    actualizarDia(i, { description: next.join('\n') })
                  }
                  return (
                  <div key={j} className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="w-28 shrink-0"
                      aria-label={`Hora de la acción ${j + 1} del día ${i + 1}`}
                      value={hora}
                      onChange={(e) => poner({ hora: e.target.value, texto })}
                    />
                    <Input
                      value={texto}
                      onChange={(e) => poner({ hora, texto: e.target.value })}
                      placeholder="Qué se hace… Ej. Visita a las cascadas de Cusárare"
                    />
                    {lineas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          actualizarDia(i, {
                            description: lineas
                              .filter((_, k) => k !== j)
                              .join('\n'),
                          })
                        }
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                  )
                }
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  actualizarDia(i, {
                    description: [
                      ...(dia.description ? dia.description.split('\n') : ['']),
                      '',
                    ].join('\n'),
                  })
                }
              >
                + Agregar acción
              </Button>
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
        <Card id="precios" className="scroll-mt-32">
          <CardHeader>
            <CardTitle>Paquetes por ocupación</CardTitle>
            <CardDescription>
              Precio por persona según el tipo de habitación. Deja en blanco los
              que no ofrezcas. Es solo precio: el cupo se controla en las salidas.
              El más barato se publica como “Precios desde”.
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
            {/* Puntero al costeo: los precios se pueden calcular desde el costo
                de proveedores × días × viajeros. Vive tras guardar (necesita el
                id, sus packs y add-ons para escribir los sugeridos de vuelta). */}
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              ¿No sabes qué precio poner? Calcúlalos desde el costo de tus
              proveedores, los días de uso y el número de viajeros.{' '}
              {servicioId ? (
                <Link
                  href={`/servicios/${servicioId}/costeo`}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Abrir costeo →
                </Link>
              ) : (
                <span className="font-medium text-foreground">
                  Guarda el servicio primero y aparecerá el botón “Abrir costeo”.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="addons" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Add-ons</CardTitle>
          <CardDescription>
            Extras con precio propio (tirolesa, comida, seguro…). En Nueva
            venta se eligen de esta lista con la descripción y el precio ya
            precargados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {addOns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin add-ons todavía. Agrega el primero.
            </p>
          )}
          {addOns.map((a, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
            >
              <Input
                aria-label={`Nombre del add-on ${i + 1}`}
                value={a.label}
                onChange={(e) => actualizarAddOn(i, { label: e.target.value })}
                placeholder="Ej. Tirolesa"
              />
              <Input
                aria-label={`Precio del add-on ${i + 1}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="w-32 sm:w-40"
                value={a.price}
                onChange={(e) => actualizarAddOn(i, { price: e.target.value })}
                placeholder="Precio"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => quitarAddOn(i)}
              >
                Quitar
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={agregarAddOn}
          >
            + Agregar add-on
          </Button>
        </CardContent>
      </Card>

      <Card id="medios" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Imágenes</CardTitle>
          <CardDescription>
            El <strong>banner</strong> es la foto principal (catálogo, ficha y al
            compartir por WhatsApp) — usa una horizontal. La <strong>galería</strong>{' '}
            (hasta {MAX_FOTOS}) se muestra en un carrusel en la ficha del viaje.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {banner ? (
            <div className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner}
                alt="Banner del servicio"
                className="aspect-[2/1] w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-[2/1] w-full items-center justify-center rounded-lg border border-dashed bg-muted text-muted-foreground">
              <ImageIcon className="size-8" />
            </div>
          )}

          {servicioId ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={elegirImagen}
              />
              <Button
                type="button"
                variant="outline"
                disabled={subiendo}
                onClick={() => fileRef.current?.click()}
              >
                {subiendo
                  ? 'Subiendo…'
                  : banner
                    ? 'Cambiar imagen'
                    : 'Subir imagen'}
              </Button>
              {banner && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={subiendo}
                  onClick={quitarImagen}
                >
                  Quitar
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Guarda el servicio primero; después podrás subir su imagen.
            </p>
          )}

          {servicioId && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <Label>
                  Galería ({album.length}/{MAX_FOTOS})
                </Label>
                <input
                  ref={albumRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={agregarFotos}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={subiendoAlbum || album.length >= MAX_FOTOS}
                  onClick={() => albumRef.current?.click()}
                >
                  {subiendoAlbum ? 'Subiendo…' : 'Agregar fotos'}
                </Button>
              </div>
              {album.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {album.map((url) => (
                    <div
                      key={url}
                      className="group relative overflow-hidden rounded-md border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => quitarFoto(url)}
                        disabled={subiendoAlbum}
                        aria-label="Quitar foto"
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin fotos en la galería. Puedes subir hasta {MAX_FOTOS}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="video" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Video (opcional)</CardTitle>
          <CardDescription>
            Un link de YouTube o Vimeo. Se muestra en la ficha del viaje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {servicioId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="url"
                inputMode="url"
                value={video}
                onChange={(e) => setVideo(e.target.value)}
                placeholder="https://youtu.be/…"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={guardandoVideo}
                onClick={guardarVideo}
              >
                {guardandoVideo ? 'Guardando…' : 'Guardar video'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Guarda el servicio primero; después podrás agregar un video.
            </p>
          )}
        </CardContent>
      </Card>

    </form>
  )
}
