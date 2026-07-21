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
import { HandCoinsIcon } from 'lucide-react'
import { mxn } from '@/components/data/format'
import type { Payables } from './data'

type Fila = Payables['lista'][number]

const columns: DataColumn<Fila>[] = [
  {
    header: 'Mayorista',
    primary: true,
    cell: (r) => (
      <div className="flex flex-col">
        <span>{r.owner ?? '—'}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {r.num_ventas === 1 ? '1 reventa' : `${r.num_ventas} reventas`}
        </span>
      </div>
    ),
  },
  {
    header: 'Le debo',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{mxn.format(r.debo)}</span>,
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
        href={`/gastos/nuevo?category=mayorista&provider=${r.owner_id}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Registrar pago
      </Link>
    ),
  },
]

export function CxpSection({ payables }: { payables: Payables }) {
  const hay = payables.lista.length > 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuentas por pagar a mayoristas</CardTitle>
        <CardDescription>
          Lo que le debes a cada agencia dueña por sus viajes que revendiste
          (total − comisión), menos lo que ya le pagaste.
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
          getRowKey={(r) => r.owner_id}
          empty={
            <EmptyState
              icon={HandCoinsIcon}
              title="Sin cuentas por pagar"
              description="Cuando revendas viajes de otra agencia (comisión), aquí verás lo que le debes."
            />
          }
        />
      </CardContent>
    </Card>
  )
}
