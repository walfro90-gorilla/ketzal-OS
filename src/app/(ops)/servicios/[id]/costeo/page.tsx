import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { listarSalidas } from '../../actions'
import { CosteoForm, type ProveedorConTarifas } from './costeo-form'
import { COSTEO_VACIO, limpiarCosteo, type Costeo, type RateLine } from '@/lib/domain/costeo'
import { limpiarPacks, type PackInput } from '@/lib/domain/packs'
import type { AddOn } from '@/lib/domain/addons'

// Costeo del servicio (ADR-0055). Solo admins: la ruta cuelga de /servicios,
// que proxy.ts ya gatea por rol; la RLS de service_costings y
// supplier_rate_cards es la defensa real (un agente recibe cero filas).

type ProvRow = {
  id: string
  name: string
  supplier_type: string | null
  supplier_rate_cards: { rates: RateLine[] } | { rates: RateLine[] }[] | null
}

export default async function CosteoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: servicio, error } = await supabase
    .from('services')
    .select(
      'id, name, supplier_id, packs, add_ons, max_capacity, itinerary, transport_provider_id, hotel_provider_id'
    )
    .eq('id', id)
    .single()

  if (error || !servicio) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Servicio no encontrado"
          description="El servicio no existe o fue eliminado."
          backHref="/servicios"
          backLabel="Volver a servicios"
        />
      </div>
    )
  }

  const [costeoRes, provRes, salidasRes] = await Promise.all([
    supabase.from('service_costings' as never).select('doc').eq('service_id', id).maybeSingle(),
    // Proveedores de la agencia DUEÑA del servicio (no de `my_supplier_id()`,
    // que es null para superadmin) con su tarifario embebido (FK 1:1).
    supabase
      .from('suppliers')
      .select('id, name, supplier_type, supplier_rate_cards(rates)' as never)
      .eq('owner_supplier_id' as never, servicio.supplier_id as never)
      .order('name'),
    listarSalidas(id),
  ])

  const packs = limpiarPacks((servicio.packs ?? []) as unknown as PackInput[])
  const addOns = (Array.isArray(servicio.add_ons) ? servicio.add_ons : []) as unknown as AddOn[]
  const addonKeys = addOns.map((a) => a.key)
  const salidas = 'salidas' in salidasRes ? salidasRes.salidas : []

  const proveedores: ProveedorConTarifas[] = ((provRes.data ?? []) as unknown as ProvRow[]).map((p) => {
    const rc = Array.isArray(p.supplier_rate_cards) ? p.supplier_rate_cards[0] : p.supplier_rate_cards
    return { id: p.id, name: p.name, supplier_type: p.supplier_type, rates: rc?.rates ?? [] }
  })

  // Defaults gratis cuando aún no hay costeo: pax = cupo del servicio, días =
  // largo del itinerario, noches = días − 1.
  const dias = Math.max(1, Array.isArray(servicio.itinerary) ? servicio.itinerary.length : 1)
  const guardado = (costeoRes.data as { doc?: unknown } | null)?.doc
  const initial: Costeo = guardado
    ? limpiarCosteo(guardado, addonKeys)
    : {
        ...COSTEO_VACIO,
        plan_pax: servicio.max_capacity ?? 16,
        days: dias,
        nights: dias - 1,
      }
  const maxN =
    servicio.max_capacity ??
    (salidas.length ? Math.max(...salidas.map((s) => s.max_capacity)) : 60)
  const preseleccion = [servicio.transport_provider_id, servicio.hotel_provider_id].filter(
    (x): x is string => typeof x === 'string'
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Costeo · ${servicio.name}`}
        description="Qué te cuesta el viaje con tus proveedores, a cuántos pasajeros empatas y qué precio deja el margen que quieres. Es un plan: el gasto real se registra en Gastos."
        backHref={`/servicios/${servicio.id}`}
        backLabel="Volver al servicio"
      />
      <CosteoForm
        serviceId={servicio.id}
        initial={initial}
        packsIniciales={packs}
        addOns={addOns}
        proveedores={proveedores}
        salidas={salidas}
        maxN={maxN}
        preseleccion={preseleccion}
      />
    </div>
  )
}
