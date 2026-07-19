'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { mxn } from '@/components/data/format'
import { StatusBadge, type BookingStatus } from '@/components/data/status-badge'

// Forma del jsonb que devuelve ketzal.commissions_summary() (subconjunto usado).
export type ComisionVenta = {
  id: string
  cliente: string | null
  servicio: string | null
  owner: string
  total: number
  rate: number
  comision: number
  status: BookingStatus
}

const columns: DataColumn<ComisionVenta>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (v) => v.cliente ?? 'Sin cliente',
    sortValue: (v) => v.cliente ?? '',
  },
  {
    header: 'Servicio',
    cell: (v) => v.servicio ?? 'A medida',
    sortValue: (v) => v.servicio ?? '',
  },
  { header: 'Agencia dueña', cell: (v) => v.owner, sortValue: (v) => v.owner },
  {
    header: 'Total venta',
    align: 'right',
    cell: (v) => (
      <span className="tabular-nums">{mxn.format(Number(v.total))}</span>
    ),
    sortValue: (v) => Number(v.total),
  },
  {
    header: '%',
    align: 'right',
    cell: (v) => <span className="tabular-nums">{Number(v.rate)}%</span>,
    sortValue: (v) => Number(v.rate),
  },
  {
    header: 'Comisión',
    align: 'right',
    cell: (v) => (
      <span className="font-semibold tabular-nums">
        {mxn.format(Number(v.comision))}
      </span>
    ),
    sortValue: (v) => Number(v.comision),
  },
  { header: 'Estado', cell: (v) => <StatusBadge status={v.status} /> },
]

export function ComisionesList({
  rows,
  empty,
}: {
  rows: ComisionVenta[]
  empty: ReactNode
}) {
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(v) => v.id}
      rowHref={(v) => `/ventas/${v.id}`}
      searchText={(v) =>
        [v.cliente, v.servicio, v.owner].filter(Boolean).join(' ')
      }
      searchPlaceholder="Buscar por cliente, servicio o agencia…"
      empty={empty}
    />
  )
}
