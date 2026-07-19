import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { MapPinIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
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

  // Vía RPC y no `from('suppliers')`: desde la migración 006 la RLS sólo deja
  // ver tu agencia y tus proveedores, así que la tabla ya no sirve para resolver
  // nombres ajenos. `list_agency_names` es SECURITY DEFINER y devuelve
  // únicamente id + nombre — sin comisión ni datos de contacto.
  const [serviciosRes, agenciasRes] = await Promise.all([
    serviciosQuery,
    supabase.rpc('list_agency_names' as never),
  ])

  const agenciaPorId = new Map(
    ((agenciasRes.data ?? []) as { id: string; name: string }[]).map(
      (agencia) => [agencia.id, agencia.name]
    )
  )

  // Se aplana el nombre de la agencia en la fila: el Map no cruza al cliente.
  const servicios: Servicio[] = (
    (serviciosRes.data ?? []) as unknown as ServicioRow[]
  ).map((s) => ({ ...s, agencia: agenciaPorId.get(s.supplier_id) ?? null }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servicios"
        description="Catálogo de viajes y paquetes que vendes."
        action={
          <Link
            href="/servicios/nuevo"
            className={buttonVariants({ variant: 'default' })}
          >
            Nuevo servicio
          </Link>
        }
      />

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
