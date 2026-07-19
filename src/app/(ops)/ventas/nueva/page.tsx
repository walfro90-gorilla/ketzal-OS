import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pack } from '@/lib/domain/packs'
import { NuevaVentaForm } from './nueva-venta-form'

export default async function NuevaVentaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Silo: un agente de agencia vende SOLO los servicios de su agencia. El
  // superadmin y el agente Ketzal libre (sin agencia) venden todo el catálogo.
  const [profileRes, customersRes] = await Promise.all([
    supabase.from('profiles').select('role, supplier_id').eq('id', user.id).single(),
    supabase
      .from('customers')
      // El teléfono distingue clientes homónimos en el buscador del combobox.
      .select('id, full_name, phone')
      .order('full_name', { ascending: true }),
  ])
  const profile = profileRes.data

  let servicesQuery = supabase
    .from('services')
    .select('id, name, price, packs')
    .order('name', { ascending: true })
  if (profile?.supplier_id && profile.role !== 'superadmin') {
    servicesQuery = servicesQuery.eq('supplier_id', profile.supplier_id)
  }
  const servicesRes = await servicesQuery

  // packs es jsonb; lo tipamos a Pack[] para el preset de precio por ocupación.
  const services = (servicesRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    packs: Array.isArray(s.packs) ? (s.packs as unknown as Pack[]) : [],
  }))

  // Salidas futuras (RLS las limita al dueño → coincide con el silo). Alimentan
  // el selector de salida con lugares restantes en la venta.
  const hoy = new Date().toISOString().slice(0, 10)
  const departuresRes = await supabase
    .from('service_departures')
    .select('id, service_id, departs_on, max_capacity, seats_taken')
    .gte('departs_on', hoy)
    .order('departs_on', { ascending: true })

  const departuresByService: Record<
    string,
    { id: string; departs_on: string; remaining: number }[]
  > = {}
  for (const d of departuresRes.data ?? []) {
    ;(departuresByService[d.service_id] ??= []).push({
      id: d.id,
      departs_on: d.departs_on,
      remaining: Math.max(0, d.max_capacity - d.seats_taken),
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/ventas"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a ventas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nueva venta</h1>
      </div>

      {(customersRes.error || servicesRes.error) && (
        <p className="text-sm text-destructive">
          Error al cargar catálogos:{' '}
          {customersRes.error?.message ?? servicesRes.error?.message}
        </p>
      )}

      <NuevaVentaForm
        customers={customersRes.data ?? []}
        services={services}
        departuresByService={departuresByService}
      />
    </div>
  )
}
