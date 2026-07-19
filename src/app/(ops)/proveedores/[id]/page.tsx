import { MapPinIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { ProveedorForm } from '../proveedor-form'
import { EliminarProveedor } from './eliminar-proveedor'

// Formatter local (mismo criterio que el resto de páginas: autocontenidas).
const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

// Todos los service_type actuales (tour/paquete/transporte/hospedaje/actividad)
// solo requieren capitalizar; sin mapa de etiquetas hasta que haya uno que no.
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function formatDestino(city: string | null, state: string | null): string {
  const partes = [city, state].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '—'
}

// Un servicio se liga a un proveedor por 3 roles posibles: agencia dueña
// (supplier_id), transporte (transport_provider_id) u hospedaje (hotel_provider_id).
type ServicioVinculado = {
  id: string
  name: string
  service_type: string | null
  city_to: string | null
  state_to: string | null
  price: number | null
  vinculo: string
}

const columnasServicios: DataColumn<ServicioVinculado>[] = [
  {
    header: 'Servicio',
    primary: true,
    cell: (s) => (
      <div className="flex flex-col">
        <span>{s.name}</span>
        {s.service_type && (
          <span className="text-xs font-normal text-muted-foreground">
            {capitalizar(s.service_type)}
          </span>
        )}
      </div>
    ),
  },
  {
    header: 'Vínculo',
    cell: (s) => s.vinculo,
  },
  {
    header: 'Destino',
    cell: (s) => formatDestino(s.city_to, s.state_to),
  },
  {
    header: 'Precio',
    align: 'right',
    cell: (s) => (
      <span className="tabular-nums">{mxn.format(Number(s.price ?? 0))}</span>
    ),
  },
]

export default async function ProveedorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Proveedor + servicios vinculados en paralelo. El OR cubre los 3 roles;
  // RLS acota lo visible (el agente solo ve servicios de su agencia).
  const [{ data: proveedor, error }, { data: serviciosData }] =
    await Promise.all([
      supabase.from('suppliers').select('*').eq('id', id).single(),
      supabase
        .from('services')
        .select(
          'id, name, service_type, city_to, state_to, price, supplier_id, transport_provider_id, hotel_provider_id'
        )
        .or(
          `supplier_id.eq.${id},transport_provider_id.eq.${id},hotel_provider_id.eq.${id}`
        )
        .order('name'),
    ])

  const servicios: ServicioVinculado[] = (serviciosData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    service_type: s.service_type,
    city_to: s.city_to,
    state_to: s.state_to,
    price: s.price,
    vinculo:
      s.supplier_id === id
        ? 'Dueña'
        : s.transport_provider_id === id
          ? 'Transporte'
          : s.hotel_provider_id === id
            ? 'Hospedaje'
            : '—',
  }))

  if (error || !proveedor) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Proveedor no encontrado"
          description="El proveedor no existe o fue eliminado."
          backHref="/proveedores"
          backLabel="Volver a proveedores"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={proveedor.name}
        backHref="/proveedores"
        backLabel="Volver a proveedores"
      />

      <ProveedorForm
        proveedorId={proveedor.id}
        initial={{
          name: proveedor.name,
          contact_email: proveedor.contact_email ?? '',
          phone_number: proveedor.phone_number ?? '',
          address: proveedor.address ?? '',
          description: proveedor.description ?? '',
          supplier_type: proveedor.supplier_type,
          commission_rate: Number(proveedor.commission_rate ?? 0),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Servicios vinculados
            {servicios.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {servicios.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Servicios donde este proveedor participa como agencia dueña,
            transporte u hospedaje. Toca uno para abrirlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataList
            columns={columnasServicios}
            rows={servicios}
            getRowKey={(s) => s.id}
            rowHref={(s) => `/servicios/${s.id}`}
            empty={
              <EmptyState
                icon={MapPinIcon}
                title="Sin servicios vinculados"
                description="Aún no hay servicios que usen este proveedor."
              />
            }
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Zona de peligro</CardTitle>
          <CardDescription>
            Eliminar el proveedor es permanente. No se puede eliminar si tiene
            servicios o ventas asociadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EliminarProveedor proveedorId={proveedor.id} />
        </CardContent>
      </Card>
    </div>
  )
}
