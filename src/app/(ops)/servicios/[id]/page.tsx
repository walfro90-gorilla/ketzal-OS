import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ServicioForm } from '../servicio-form'
import { EliminarServicio } from './eliminar-servicio'

/** El jsonb includes/excludes → textarea: una línea por concepto. */
function jsonbALineas(valor: unknown): string {
  return Array.isArray(valor) ? valor.map(String).join('\n') : ''
}

/** timestamptz → valor del input date (YYYY-MM-DD). */
function fechaAInput(valor: string | null): string {
  return valor ? valor.slice(0, 10) : ''
}

export default async function ServicioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [servicioRes, agenciasRes] = await Promise.all([
    supabase.from('services').select('*').eq('id', id).single(),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('supplier_type', 'agency')
      .order('name'),
  ])

  const servicio = servicioRes.data

  if (servicioRes.error || !servicio) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href="/servicios"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a servicios
        </Link>
        <h1 className="text-2xl font-semibold">Servicio no encontrado</h1>
        <p className="text-sm text-muted-foreground">
          El servicio no existe o fue eliminado.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/servicios"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a servicios
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{servicio.name}</h1>
      </div>

      {agenciasRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las agencias: {agenciasRes.error.message}
        </p>
      )}

      <ServicioForm
        servicioId={servicio.id}
        agencias={agenciasRes.data ?? []}
        initial={{
          name: servicio.name,
          supplier_id: servicio.supplier_id,
          description: servicio.description ?? '',
          price: Number(servicio.price ?? 0),
          service_type: servicio.service_type,
          state_from: servicio.state_from ?? '',
          city_from: servicio.city_from ?? '',
          state_to: servicio.state_to ?? '',
          city_to: servicio.city_to ?? '',
          max_capacity: servicio.max_capacity,
          available_from: fechaAInput(servicio.available_from),
          available_to: fechaAInput(servicio.available_to),
          includes: jsonbALineas(servicio.includes),
          excludes: jsonbALineas(servicio.excludes),
        }}
      />

      <Card className="border-destructive/50">
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
  )
}
