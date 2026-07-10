import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { MapPinIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { ServiciosList, type Servicio } from './servicios-list'

type ServicioRow = Omit<Servicio, 'agencia'>

export default async function ServiciosPage() {
  const supabase = await createClient()

  // services tiene 3 FKs hacia suppliers (dueña, transporte, hotel), por lo
  // que el embed `supplier:suppliers(...)` es ambiguo. El nombre de la agencia
  // dueña se resuelve con una consulta aparte (mismo patrón que /comisiones).
  const [serviciosRes, agenciasRes] = await Promise.all([
    supabase
      .from('services')
      .select(
        'id, name, price, service_type, state_to, city_to, max_capacity, supplier_id'
      )
      .order('name'),
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
