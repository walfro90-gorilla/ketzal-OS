import { HandCoinsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { formatTravelDate, mxn } from '../ventas/ui'
import { getCobranza, type CobranzaItem } from './data'

const columns: DataColumn<CobranzaItem>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        {c.cliente}
        {c.atrasado > 0 && <Badge variant="destructive">Atrasada</Badge>}
      </span>
    ),
  },
  { header: 'Servicio', cell: (c) => c.servicio },
  {
    header: 'Saldo',
    align: 'right',
    cell: (c) => (
      <span className="tabular-nums">{mxn.format(Number(c.saldo))}</span>
    ),
  },
  {
    header: 'Próximo pago',
    cell: (c) =>
      c.con_plan && c.proximo_due ? (
        <span className="whitespace-nowrap">
          {formatTravelDate(c.proximo_due)}
          <span className="ml-1 tabular-nums text-muted-foreground">
            · {mxn.format(Number(c.proximo_monto ?? 0))}
          </span>
        </span>
      ) : c.con_plan ? (
        <span className="text-muted-foreground">Plan cubierto</span>
      ) : (
        <span className="text-muted-foreground">Contado</span>
      ),
  },
  {
    header: 'Atrasado',
    align: 'right',
    cell: (c) =>
      c.atrasado > 0 ? (
        <span className="font-semibold tabular-nums text-destructive">
          {mxn.format(Number(c.atrasado))}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
]

export default async function CobranzaPage() {
  const data = await getCobranza()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobranza"
        description="Ventas con saldo pendiente: el próximo pago del plan y cuánto van atrasadas."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Por cobrar</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(data.total_saldo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {data.num_ventas} {data.num_ventas === 1 ? 'venta' : 'ventas'} con
              saldo
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            data.total_atrasado > 0
              ? 'bg-destructive/5 ring-destructive/30'
              : undefined
          }
        >
          <CardHeader>
            <CardDescription
              className={data.total_atrasado > 0 ? 'text-destructive' : undefined}
            >
              Atrasado
            </CardDescription>
            <CardTitle
              className={cn(
                'text-2xl tabular-nums',
                data.total_atrasado > 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {mxn.format(Number(data.total_atrasado))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Monto que ya debía estar pagado según el plan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ventas con saldo</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.num_ventas}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Ordenadas por atraso (las urgentes primero)
            </p>
          </CardContent>
        </Card>
      </div>

      <DataList
        columns={columns}
        rows={data.items}
        getRowKey={(c) => c.id}
        rowHref={(c) => `/ventas/${c.id}`}
        empty={
          <EmptyState
            icon={HandCoinsIcon}
            title="Nada por cobrar"
            description="Todas las ventas están liquidadas. Cuando una venta tenga saldo aparecerá aquí."
          />
        }
      />
    </div>
  )
}
