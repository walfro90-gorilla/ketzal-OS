import { HandCoinsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { mxn } from '../ventas/ui'
import { getCobranza } from './data'
import { CobranzaList } from './cobranza-list'

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

      <CobranzaList
        rows={data.items}
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
