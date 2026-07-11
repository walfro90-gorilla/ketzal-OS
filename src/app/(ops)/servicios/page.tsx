import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { MapPinIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { ServiciosList, type Servicio } from './servicios-list'

type ServicioRow = Omit<Servicio, 'agencia'>

export default async function ServiciosPage() {
  const supabase = await createClient()

  // Silo: el admin de una agencia solo administra SUS servicios. El superadmin
  // ve todo el catálogo (por eso conserva la columna de agencia).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('role, supplier_id')
        .eq('id', user.id)
        .single()
    : { data: null }

  // services tiene 3 FKs hacia suppliers (dueña, transporte, hotel), por lo
  // que el embed `supplier:suppliers(...)` es ambiguo. El nombre de la agencia
  // dueña se resuelve con una consulta aparte (mismo patrón que /comisiones).
  let serviciosQuery = supabase
    .from('services')
    .select(
      'id, name, price, service_type, state_to, city_to, max_capacity, supplier_id, published'
    )
    .order('name')
  if (profile?.supplier_id && profile.role !== 'superadmin') {
    serviciosQuery = serviciosQuery.eq('supplier_id', profile.supplier_id)
  }

  const [serviciosRes, agenciasRes] = await Promise.all([
    serviciosQuery,
    supabase.from('suppliers').select('id, name'),
  ])

  const agenciaPorId = new Map(
    (agenciasRes.data ?? []).map((agencia) => [agencia.id, agencia.name])
  )

  // Se aplana el nombre de la agencia en la fila: el Map no cruza al cliente.
  const servicios: Servicio[] = (
    (serviciosRes.data ?? []) as unknown as ServicioRow[]
  ).map((s) => ({ ...s, agencia: agenciaPorId.get(s.supplier_id) ?? null }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Servicios</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Catálogo de viajes y paquetes que vendes.
          </p>
        </div>
        <Link
          href="/servicios/nuevo"
          className={buttonVariants({ variant: 'default' })}
        >
          Nuevo servicio
        </Link>
      </div>

      {serviciosRes.error ? (
        <p className="text-sm text-destructive">
          Error al leer los servicios: {serviciosRes.error.message}
        </p>
      ) : (
        <ServiciosList
          rows={servicios}
          empty={
            <EmptyState
              icon={MapPinIcon}
              title="Aún no hay servicios"
              description="Agrega los viajes y paquetes de tu catálogo."
              action={
                <Link
                  href="/servicios/nuevo"
                  className={buttonVariants({ variant: 'default' })}
                >
                  Nuevo servicio
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}
