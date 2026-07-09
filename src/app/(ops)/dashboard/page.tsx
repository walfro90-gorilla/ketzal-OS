import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
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
  due_date: string | null
  vencida: boolean
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
  monto_vencido: number
  num_vencidas: number
  ventas_saldo: VentaSaldo[]
  proximos_viajes: ProximoViaje[]
}

const EMPTY_SUMMARY: DashboardSummary = {
  por_cobrar: 0,
  num_por_cobrar: 0,
  num_cotizaciones: 0,
  total_vendido: 0,
  num_ventas: 0,
  monto_vencido: 0,
  num_vencidas: 0,
  ventas_saldo: [],
  proximos_viajes: [],
}

function pluralVentas(n: number): string {
  return n === 1 ? '1 venta' : `${n} ventas`
}

function pluralVencidas(n: number): string {
  return n === 1 ? '1 vencida' : `${n} vencidas`
}

const porCobrarColumns: DataColumn<VentaSaldo>[] = [
  { header: 'Cliente', primary: true, cell: (v) => v.cliente ?? 'Sin cliente' },
  { header: 'Servicio', cell: (v) => v.servicio ?? 'A medida' },
  {
    header: 'Total',
    align: 'right',
    cell: (v) => <span className="tabular-nums">{mxn.format(Number(v.total))}</span>,
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (v) => (
      <span className="font-semibold tabular-nums">
        {mxn.format(Number(v.saldo))}
      </span>
    ),
  },
  {
    header: 'Vence',
    cell: (v) => (
      <span
        className={cn(
          'inline-flex items-center gap-2',
          v.vencida && 'text-destructive'
        )}
      >
        <span className="whitespace-nowrap">{formatTravelDate(v.due_date)}</span>
        {v.vencida && <Badge variant="destructive">Vencida</Badge>}
      </span>
    ),
  },
  { header: 'Estado', cell: (v) => <StatusBadge status={v.status} /> },
]

const proximosColumns: DataColumn<ProximoViaje>[] = [
  { header: 'Cliente', primary: true, cell: (v) => v.cliente ?? 'Sin cliente' },
  { header: 'Servicio', cell: (v) => v.servicio ?? 'A medida' },
  { header: 'Fecha', cell: (v) => formatTravelDate(v.travel_date) },
  {
    header: 'Pax',
    align: 'right',
    cell: (v) => <span className="tabular-nums">{v.num_pax}</span>,
  },
  { header: 'Estado', cell: (v) => <StatusBadge status={v.status} /> },
]

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
  const montoVencido = Number(d.monto_vencido ?? 0)
  const hayVencidas = montoVencido > 0

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

        <Card className={hayVencidas ? 'border-destructive/50 bg-destructive/5' : undefined}>
          <CardHeader>
            <CardDescription className={hayVencidas ? 'text-destructive' : undefined}>
              Vencido
            </CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums${hayVencidas ? ' text-destructive' : ''}`}
            >
              {mxn.format(montoVencido)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xs ${hayVencidas ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {pluralVencidas(d.num_vencidas ?? 0)}
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
            <DataList
              columns={porCobrarColumns}
              rows={ventasSaldo}
              getRowKey={(v) => v.id}
              rowHref={(v) => `/ventas/${v.id}`}
              empty={
                <p className="text-sm text-muted-foreground">
                  Nada por cobrar. 🎉
                </p>
              }
            />
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
            <DataList
              columns={proximosColumns}
              rows={proximosViajes}
              getRowKey={(v) => v.id}
              rowHref={(v) => `/ventas/${v.id}`}
              empty={
                <p className="text-sm text-muted-foreground">
                  Sin viajes próximos.
                </p>
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
