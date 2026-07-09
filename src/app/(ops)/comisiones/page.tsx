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
import { mxn, StatusBadge, type BookingStatus } from '../ventas/ui'
import { TasaForm } from './tasa-form'

// Forma del jsonb que devuelve ketzal.commissions_summary().
// Los tipos generados a mano declaran `Returns: Json`, así que se
// estrecha aquí con un cast (mismo patrón que en /dashboard).
type ComisionVenta = {
  id: string
  cliente: string | null
  servicio: string | null
  owner: string
  total: number
  rate: number
  comision: number
  status: BookingStatus
}

type CommissionsSummary = {
  total_comision: number
  num: number
  lista: ComisionVenta[]
}

const EMPTY_SUMMARY: CommissionsSummary = {
  total_comision: 0,
  num: 0,
  lista: [],
}

function pluralRevendidas(n: number): string {
  return n === 1 ? '1 venta revendida' : `${n} ventas revendidas`
}

export default async function ComisionesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const [agenciasRes, summaryRes] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, commission_rate')
      .eq('supplier_type', 'agency')
      .order('name'),
    supabase.rpc('commissions_summary'),
  ])

  const agencias = agenciasRes.data ?? []
  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as CommissionsSummary
  const lista = d.lista ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comisiones</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lo que ganas por revender viajes de otras agencias.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de porcentajes</CardTitle>
          <CardDescription>
            El % que cada agencia te paga cuando revendes sus viajes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agenciasRes.error ? (
            <p className="text-sm text-destructive">
              Error al cargar las agencias: {agenciasRes.error.message}
            </p>
          ) : agencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay agencias registradas.
            </p>
          ) : (
            <ul className="divide-y">
              {agencias.map((agencia) => (
                <li
                  key={agencia.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium">{agencia.name}</span>
                  <TasaForm
                    supplierId={agencia.id}
                    initialRate={Number(agencia.commission_rate ?? 0)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las comisiones: {summaryRes.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total comisiones</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_comision ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pluralRevendidas(d.num ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comisiones ganadas</CardTitle>
          <CardDescription>
            Ventas donde el servicio pertenece a otra agencia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no has revendido viajes de otra agencia. Cuando vendas un
              servicio cuyo dueño es otra agencia, la comisión aparece aquí.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Agencia dueña</TableHead>
                    <TableHead className="text-right">Total venta</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((venta) => (
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
                      <TableCell>{venta.owner}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mxn.format(Number(venta.total))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(venta.rate)}%
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {mxn.format(Number(venta.comision))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={venta.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
