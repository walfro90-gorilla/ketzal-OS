'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { formatTravelDate, mxn } from '@/components/data/format'

export type Cliente = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  created_at: string
  num_ventas: number
  total_comprado: number
  ultima_venta: string | null
}

const columns: DataColumn<Cliente>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (c) => c.full_name,
    sortValue: (c) => c.full_name,
  },
  {
    header: 'Contacto',
    cell: (c) =>
      c.phone || c.email ? (
        <div className="flex flex-col text-xs text-muted-foreground">
          {c.phone && <span>{c.phone}</span>}
          {c.email && <span>{c.email}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: '# Ventas',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{c.num_ventas}</span>,
    sortValue: (c) => c.num_ventas,
  },
  {
    header: 'Total comprado',
    align: 'right',
    cell: (c) => (
      <span className="tabular-nums">{mxn.format(Number(c.total_comprado))}</span>
    ),
    sortValue: (c) => Number(c.total_comprado),
  },
  {
    header: 'Última compra',
    cell: (c) => formatTravelDate(c.ultima_venta?.slice(0, 10) ?? null),
    sortValue: (c) => c.ultima_venta,
  },
]

export function ClientesList({
  rows,
  empty,
}: {
  rows: Cliente[]
  empty: ReactNode
}) {
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(c) => c.id}
      rowHref={(c) => `/clientes/${c.id}`}
      searchText={(c) => [c.full_name, c.phone, c.email].filter(Boolean).join(' ')}
      searchPlaceholder="Buscar por nombre, teléfono o correo…"
      empty={empty}
    />
  )
}
