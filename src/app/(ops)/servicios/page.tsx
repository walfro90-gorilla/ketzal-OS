import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  const servicios = serviciosRes.data ?? []
  const agenciaPorId = new Map(
    (agenciasRes.data ?? []).map((agencia) => [agencia.id, agencia.name])
  )

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
      ) : servicios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay servicios. Crea el primero.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Agencia</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Cupo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicios.map((servicio) => (
              <TableRow key={servicio.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <Link
                      href={`/servicios/${servicio.id}`}
                      className="font-medium hover:underline"
                    >
                      {servicio.name}
                    </Link>
                    {servicio.service_type && (
                      <span className="text-xs text-muted-foreground">
                        {TIPO_LABELS[servicio.service_type] ??
                          servicio.service_type}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {agenciaPorId.get(servicio.supplier_id) ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {formatDestino(servicio.city_to, servicio.state_to)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {mxn.format(Number(servicio.price ?? 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {servicio.max_capacity ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
