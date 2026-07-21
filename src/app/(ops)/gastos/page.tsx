import Link from 'next/link'
import { PlusIcon, ReceiptTextIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { mxn } from '@/components/data/format'
import { listExpenses, getExpensesSummary, getPayables } from './data'
import { GastosList } from './gastos-list'
import { CxpSection } from './cxp-section'

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const mesLargo = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })

export default async function GastosPage() {
  const hoy = new Date()
  const from = isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const to = isoDate(hoy)

  const [rows, resumen, payables] = await Promise.all([
    listExpenses(),
    getExpensesSummary(from, to),
    getPayables(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos"
        description="Egresos de la agencia y cuentas por pagar a mayoristas."
        action={
          <Link
            href="/gastos/nuevo"
            className={buttonVariants({ variant: 'default' })}
          >
            <PlusIcon className="size-4" />
            Nuevo gasto
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Gastos de {mesLargo.format(hoy)}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(resumen.total_gastos))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {resumen.num === 1 ? '1 movimiento' : `${resumen.num} movimientos`} este mes
            </p>
          </CardContent>
        </Card>
        <Card
          className={
            payables.total_saldo > 0 ? 'border-amber-500/50 bg-amber-500/5' : undefined
          }
        >
          <CardHeader>
            <CardDescription
              className={payables.total_saldo > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}
            >
              Por pagar a mayoristas
            </CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums${payables.total_saldo > 0 ? ' text-amber-700 dark:text-amber-400' : ''}`}
            >
              {mxn.format(Number(payables.total_saldo))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <CardDescription>
            Todos los egresos registrados (los reversos corrigen sin borrar).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GastosList
            rows={rows}
            empty={
              <EmptyState
                icon={ReceiptTextIcon}
                title="Aún no hay gastos"
                description="Registra la gasolina, hospedaje, pagos a mayoristas y demás egresos de la agencia."
                action={
                  <Link
                    href="/gastos/nuevo"
                    className={buttonVariants({ variant: 'default' })}
                  >
                    Nuevo gasto
                  </Link>
                }
              />
            }
          />
        </CardContent>
      </Card>

      <CxpSection payables={payables} />
    </div>
  )
}
