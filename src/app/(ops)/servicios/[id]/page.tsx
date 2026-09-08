import Link from 'next/link'
import { ciudadesConocidas } from '@/app/(ops)/proveedores/data'
import { CalculatorIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { ServicioForm } from '../servicio-form'
import { listarSalidas } from '../actions'
import { EliminarServicio } from './eliminar-servicio'
import { IndiceSecciones, type SeccionFicha } from './indice-secciones'
import { SalidasEditor } from './salidas-editor'
import type { Pack } from '@/lib/domain/packs'
import type { AddOn } from '@/lib/domain/addons'

/** El jsonb includes/excludes → textarea: una línea por concepto. */
function jsonbALineas(valor: unknown): string {
  return Array.isArray(valor) ? valor.map(String).join('\n') : ''
}

/** El jsonb packs → lista de paquetes {key, label, price}. */
function jsonbAPacks(valor: unknown): Pack[] {
  return Array.isArray(valor) ? (valor as Pack[]) : []
}

/** El jsonb add_ons → lista de add-ons {key, label, price}. */
function jsonbAAddOns(valor: unknown): AddOn[] {
  return Array.isArray(valor) ? (valor as AddOn[]) : []
}

/** El jsonb itinerary → lista de días {title, description}. */
function jsonbAItinerario(
  valor: unknown
): { title: string; description: string }[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      title: String(d.title ?? ''),
      description: String(d.description ?? ''),
    }))
}

/** timestamptz → valor del input date (YYYY-MM-DD). */
function fechaAInput(valor: string | null): string {
  return valor ? valor.slice(0, 10) : ''
}

export default async function ServicioDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** `salida` y `hueco` los manda /salidas#huecos para precargar la fecha (ADR-0058). */
  searchParams: Promise<{ salida?: string; hueco?: string }>
}) {
  const { id } = await params
  const { salida: fechaSugerida, hueco } = await searchParams
  const supabase = await createClient()

  const [servicioRes, agenciasRes, salidasRes] = await Promise.all([
    supabase.from('services').select('*').eq('id', id).single(),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('supplier_type', 'agency')
      .order('name'),
    listarSalidas(id),
  ])

  const servicio = servicioRes.data
  const salidas = 'salidas' in salidasRes ? salidasRes.salidas : []

  if (servicioRes.error || !servicio) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Servicio no encontrado"
          description="El servicio no existe o fue eliminado."
          backHref="/servicios"
          backLabel="Volver a servicios"
        />
      </div>
    )
  }

  const SECCIONES: SeccionFicha[] = [
    { id: 'identidad', label: 'Identidad' },
    { id: 'ruta', label: 'Ruta y fechas' },
    { id: 'capacidad', label: 'Capacidad' },
    { id: 'incluye', label: 'Qué incluye' },
    { id: 'itinerario', label: 'Itinerario' },
    { id: 'precios', label: 'Precios' },
    { id: 'addons', label: 'Add-ons' },
    { id: 'medios', label: 'Imágenes y video' },
    { id: 'salidas', label: 'Salidas' },
    { id: 'costeo', label: 'Costeo' },
    { id: 'peligro', label: 'Zona de peligro' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6 lg:max-w-5xl">
      <PageHeader
        title={servicio.name}
        backHref="/servicios"
        backLabel="Volver a servicios"
      />

      {agenciasRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las agencias: {agenciasRes.error.message}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <IndiceSecciones secciones={SECCIONES} />
        </aside>

        <div className="space-y-6">
      <ServicioForm
        ciudadesSugeridas={await ciudadesConocidas()}
        servicioId={servicio.id}
        agencias={agenciasRes.data ?? []}
        initial={{
          name: servicio.name,
          supplier_id: servicio.supplier_id,
          description: servicio.description ?? '',
          service_type: servicio.service_type,
          state_from: servicio.state_from ?? '',
          city_from: servicio.city_from ?? '',
          country_from:
            (servicio as { country_from?: string | null }).country_from ?? null,
          state_to: servicio.state_to ?? '',
          city_to: servicio.city_to ?? '',
          country_to: (servicio as { country_to?: string | null }).country_to ?? null,
          max_capacity: servicio.max_capacity,
          duration_days: (servicio as { duration_days?: number | null }).duration_days ?? null,
          meses_ideales: (servicio as { meses_ideales?: number[] | null }).meses_ideales ?? null,
          // transport_type (b041) es columna nueva no tipada ⇒ cast.
          transport_type:
            (servicio as { transport_type?: string | null }).transport_type ?? null,
          available_from: fechaAInput(servicio.available_from),
          available_to: fechaAInput(servicio.available_to),
          includes: jsonbALineas(servicio.includes),
          excludes: jsonbALineas(servicio.excludes),
          itinerary: jsonbAItinerario(servicio.itinerary),
          packs: jsonbAPacks(servicio.packs),
          add_ons: jsonbAAddOns(servicio.add_ons),
          // `published` es columna nueva no tipada aún ⇒ cast (convención multi-agente).
          published: Boolean((servicio as { published?: boolean }).published),
          banner:
            (servicio as { images?: { imgBanner?: string } | null }).images
              ?.imgBanner ?? null,
          album:
            (servicio as { images?: { imgAlbum?: string[] } | null }).images
              ?.imgAlbum ?? [],
          video: (servicio as { yt_link?: string | null }).yt_link ?? null,
        }}
      />

      <SalidasEditor
        serviceId={servicio.id}
        initial={salidas}
        packs={jsonbAPacks(servicio.packs)}
        fechaSugerida={/^\d{4}-\d{2}-\d{2}$/.test(fechaSugerida ?? '') ? fechaSugerida : undefined}
        hueco={hueco}
      />

      <Card id="costeo" className="scroll-mt-32">
        <CardHeader>
          <CardTitle>Costeo</CardTitle>
          <CardDescription>
            Qué te cuesta este viaje con las tarifas de tus proveedores, a
            cuántos pasajeros empatas y qué precio deja tu margen. Solo lo ven
            los admins de la agencia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/servicios/${servicio.id}/costeo`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <CalculatorIcon className="size-4" />
            Abrir costeo
          </Link>
        </CardContent>
      </Card>

      <Card id="peligro" className="scroll-mt-32 border-destructive/50">
        <CardHeader>
          <CardTitle>Zona de peligro</CardTitle>
          <CardDescription>
            Eliminar el servicio es permanente. No se puede eliminar si tiene
            ventas asociadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EliminarServicio servicioId={servicio.id} />
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  )
}
