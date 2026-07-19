'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { formatTravelDate, mxn } from '../ventas/ui'
import type { CobranzaItem } from './data'

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
    sortValue: (c) => c.cliente,
  },
  { header: 'Servicio', cell: (c) => c.servicio, sortValue: (c) => c.servicio },
  {
    header: 'Saldo',
    align: 'right',
    cell: (c) => (
      <span className="tabular-nums">{mxn.format(Number(c.saldo))}</span>
    ),
    sortValue: (c) => Number(c.saldo),
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
    sortValue: (c) => c.proximo_due,
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
    sortValue: (c) => Number(c.atrasado),
  },
]

export function CobranzaList({
  rows,
  empty,
}: {
  rows: CobranzaItem[]
  empty: ReactNode
}) {
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(c) => c.id}
      rowHref={(c) => `/ventas/${c.id}`}
      searchText={(c) => [c.cliente, c.servicio].filter(Boolean).join(' ')}
      searchPlaceholder="Buscar por cliente o servicio…"
      filters={[
        {
          key: 'atraso',
          label: 'Estado',
          getValue: (c) => (c.atrasado > 0 ? 'atrasada' : 'al_dia'),
          options: [
            { value: 'atrasada', label: 'Atrasadas' },
            { value: 'al_dia', label: 'Al corriente' },
          ],
        },
      ]}
      empty={empty}
    />
  )
}
