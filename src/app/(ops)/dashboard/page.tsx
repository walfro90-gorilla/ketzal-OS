import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatTravelDate,
  mxn,
  StatusBadge,
  type BookingStatus,
} from '../ventas/ui'

// Forma del jsonb que devuelve ketzal.dashboard_summary().
// Los tipos generados a mano declaran `Returns: Json`, así que se
// estrecha aquí con un cast (mismo patrón que en /ventas).
type VentaSaldo = {
  id: string
  cliente: string | null
  servicio: string | null
  total: number
  saldo: number
  status: BookingStatus
}

type ProximoViaje = {
  id: string
  cliente: string | null
  servicio: string | null
  travel_date: string | null
  num_pax: number
  status: BookingStatus
}

type DashboardSummary = {
  por_cobrar: number
  num_por_cobrar: number
  num_cotizaciones: number
  total_vendido: number
  num_ventas: number
  ventas_saldo: VentaSaldo[]
  proximos_viajes: ProximoViaje[]
}

const EMPTY_SUMMARY: DashboardSummary = {
  por_cobrar: 0,
  num_por_cobrar: 0,
  num_cotizaciones: 0,
  total_vendido: 0,
  num_ventas: 0,
  ventas_saldo: [],
  proximos_viajes: [],
}

function pluralVentas(n: number): string {
  return n === 1 ? '1 venta' : `${n} ventas`
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const [summaryRes, profileRes] = await Promise.all([
    supabase.rpc('dashboard_summary'),
    supabase
      .from('profiles')
      .select('supplier_id')
      .eq('id', user.id)
      .single(),
  ])

  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as DashboardSummary
  const ventasSaldo = d.ventas_saldo ?? []
  const proximosViajes = d.proximos_viajes ?? []

  let agencia: string | null = null
  const supplierId = profileRes.data?.supplier_id
  if (supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', supplierId)
      .single()
    agencia = supplier?.name ?? null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Panel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {agencia ? `Resumen operativo de ${agencia}` : 'Resumen operativo'}
        </p>
      </div>

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el resumen: {summaryRes.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Por cobrar</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.por_cobrar ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pluralVentas(d.num_por_cobrar ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ventas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {d.num_ventas ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Reservadas, confirmadas y pagadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Cotizaciones</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {d.num_cotizaciones ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">En borrador</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Total vendido</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_vendido ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pluralVentas(d.num_ventas ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por cobrar</CardTitle>
            <CardDescription>
              Ventas reservadas o confirmadas con saldo pendiente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ventasSaldo.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada por cobrar. 🎉
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasSaldo.map((venta) => (
                    <TableRow key={venta.id}>
                      <TableCell>
                        <Link
                          href={`/ventas/${venta.id}`}
                          className="font-medium hover:underline"
                        >
                          {venta.cliente ?? 'Sin cliente'}
                        </Link>
                      </TableCell>
                      <TableCell>{venta.servicio ?? 'A medida'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mxn.format(Number(venta.total))}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {mxn.format(Number(venta.saldo))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={venta.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos viajes</CardTitle>
            <CardDescription>
              Salidas con fecha de viaje a partir de hoy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {proximosViajes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin viajes próximos.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Pax</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximosViajes.map((viaje) => (
                    <TableRow key={viaje.id}>
                      <TableCell>
                        <Link
                          href={`/ventas/${viaje.id}`}
                          className="font-medium hover:underline"
                        >
                          {viaje.cliente ?? 'Sin cliente'}
                        </Link>
                      </TableCell>
                      <TableCell>{viaje.servicio ?? 'A medida'}</TableCell>
                      <TableCell>{formatTravelDate(viaje.travel_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {viaje.num_pax}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={viaje.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
