'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList, type ListFilter } from '@/components/data/filterable-list'
import { formatTravelDate, mxn, StatusBadge, type BookingStatus } from './ui'

export type SaleRow = {
  id: string
  folio: string | null
  travel_date: string | null
  total: number
  status: BookingStatus
  customer: { full_name: string } | null
  service: { name: string } | null
}

const columns: DataColumn<SaleRow>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (s) => (
      <>
        {s.customer?.full_name ?? 'Sin cliente'}
        {s.folio && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {s.folio}
          </span>
        )}
      </>
    ),
  },
  { header: 'Servicio', cell: (s) => s.service?.name ?? 'A medida' },
  { header: 'Fecha', cell: (s) => formatTravelDate(s.travel_date) },
  {
    header: 'Total',
    align: 'right',
    cell: (s) => (
      <span className="tabular-nums">{mxn.format(Number(s.total))}</span>
    ),
  },
  { header: 'Estado', cell: (s) => <StatusBadge status={s.status} /> },
]

const filters: ListFilter<SaleRow>[] = [
  {
    key: 'estado',
    label: 'Estado',
    options: [
      { value: 'draft', label: 'Cotización' },
      { value: 'reserved', label: 'Reservada' },
      { value: 'paid', label: 'Pagada' },
      { value: 'cancelled', label: 'Cancelada' },
    ],
    getValue: (s) => s.status,
  },
]

export function VentasList({
  rows,
  empty,
}: {
  rows: SaleRow[]
  empty: ReactNode
}) {
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(s) => s.id}
      rowHref={(s) => `/ventas/${s.id}`}
      searchText={(s) =>
        [s.customer?.full_name, s.service?.name, s.folio]
          .filter(Boolean)
          .join(' ')
      }
      searchPlaceholder="Buscar por cliente, servicio o folio…"
      filters={filters}
      empty={empty}
    />
  )
}
