import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { MapPinIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { mxn } from '../ventas/ui'

const TIPO_LABELS: Record<string, string> = {
  tour: 'Tour',
  paquete: 'Paquete',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  actividad: 'Actividad',
}

/** "{ciudad}, {estado}" con lo que haya; "—" si no hay nada. */
function formatDestino(city: string | null, state: string | null): string {
  const partes = [city, state].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '—'
}

type ServicioRow = {
  id: string
  name: string
  price: number | null
  service_type: string | null
  state_to: string | null
  city_to: string | null
  max_capacity: number | null
  supplier_id: string
}

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

  const servicios = (serviciosRes.data ?? []) as unknown as ServicioRow[]
  const agenciaPorId = new Map(
    (agenciasRes.data ?? []).map((agencia) => [agencia.id, agencia.name])
  )

  const columns: DataColumn<ServicioRow>[] = [
    {
      header: 'Nombre',
      primary: true,
      cell: (s) => (
        <div className="flex flex-col">
          <span>{s.name}</span>
          {s.service_type && (
            <span className="text-xs font-normal text-muted-foreground">
              {TIPO_LABELS[s.service_type] ?? s.service_type}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Agencia',
      cell: (s) =>
        agenciaPorId.get(s.supplier_id) ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: 'Destino', cell: (s) => formatDestino(s.city_to, s.state_to) },
    {
      header: 'Precio',
      align: 'right',
      cell: (s) => (
        <span className="tabular-nums">{mxn.format(Number(s.price ?? 0))}</span>
      ),
    },
    {
      header: 'Cupo',
      align: 'right',
      cell: (s) =>
        s.max_capacity != null ? (
          <span className="tabular-nums">{s.max_capacity}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

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
        <DataList
          columns={columns}
          rows={servicios}
          getRowKey={(s) => s.id}
          rowHref={(s) => `/servicios/${s.id}`}
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
