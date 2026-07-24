import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { UsersIcon } from 'lucide-react'
import { mxn } from '@/components/data/format'
import type { AmbassadorPayables } from './data'

type Fila = AmbassadorPayables['lista'][number]

const columns: DataColumn<Fila>[] = [
  {
    header: 'Embajador',
    primary: true,
    cell: (r) => (
      <div className="flex flex-col">
        <span>{r.embajador ?? '—'}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {r.num_ventas === 1 ? '1 venta' : `${r.num_ventas} ventas`}
        </span>
      </div>
    ),
  },
  {
    header: 'Devengado',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{mxn.format(r.devengado)}</span>,
  },
  {
    header: 'Pagado',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{mxn.format(r.pagado)}</span>,
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (r) => (
      <span
        className={`font-semibold tabular-nums ${r.saldo > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}
      >
        {mxn.format(r.saldo)}
      </span>
    ),
  },
  {
    header: 'Acciones',
    align: 'right',
    fullWidthOnCard: true,
    cell: (r) => (
      <Link
        href={`/gastos/nuevo?category=embajador&provider=${r.embajador_id}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Registrar pago
      </Link>
    ),
  },
]

export function CxpEmbajadoresSection({
  payables,
}: {
  payables: AmbassadorPayables
}) {
  const hay = payables.lista.length > 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuentas por pagar a embajadores</CardTitle>
        <CardDescription>
          Lo que Ketzal le debe a cada embajador por las ventas que trajo con su
          código, menos lo que ya le pagó.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hay && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total a pagar</p>
              <p className="text-lg font-bold tabular-nums">
                {mxn.format(payables.total_debo)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="text-lg font-bold tabular-nums">
                {mxn.format(payables.total_pagado)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Saldo pendiente
              </p>
              <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {mxn.format(payables.total_saldo)}
              </p>
            </div>
          </div>
        )}
        <DataList
          columns={columns}
          rows={payables.lista}
          getRowKey={(r) => r.embajador_id}
          empty={
            <EmptyState
              icon={UsersIcon}
              title="Sin cuentas por pagar a embajadores"
              description="Cuando un embajador venda con su código, aquí verás lo que Ketzal le debe."
            />
          }
        />
      </CardContent>
    </Card>
  )
}
