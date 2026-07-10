'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { mxn } from '../ventas/ui'
import { CotizacionAcciones } from './cotizacion-acciones'

export type QuoteRow = {
  id: string
  quote_token: string
  travel_date: string | null
  total: number
  created_at: string
  customer: { full_name: string } | null
  service: { name: string } | null
}

const createdAtFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
})

export function CotizacionesList({
  rows,
  agenciaNombre,
  empty,
}: {
  rows: QuoteRow[]
  /** Nombre de la agencia del agente, para el mensaje de WhatsApp. */
  agenciaNombre: string
  empty: ReactNode
}) {
  // Las columnas dependen de agenciaNombre (prop del servidor), así que se
  // construyen dentro del componente, no a nivel de módulo.
  const columns: DataColumn<QuoteRow>[] = [
    {
      header: 'Cliente',
      primary: true,
      cell: (q) => q.customer?.full_name ?? 'Sin cliente',
    },
    { header: 'Servicio', cell: (q) => q.service?.name ?? 'A medida' },
    {
      header: 'Total (MXN)',
      align: 'right',
      cell: (q) => (
        <span className="tabular-nums">{mxn.format(Number(q.total))}</span>
      ),
    },
    {
      header: 'Creada',
      cell: (q) => createdAtFormatter.format(new Date(q.created_at)),
    },
    {
      header: 'Acciones',
      fullWidthOnCard: true,
      cell: (q) => (
        <CotizacionAcciones
          bookingId={q.id}
          quoteToken={q.quote_token}
          clienteNombre={q.customer?.full_name ?? 'cliente'}
          agenciaNombre={agenciaNombre}
        />
      ),
    },
  ]

  // Sin filtro: todas las cotizaciones comparten status='draft', no hay
  // dimensión discreta natural. Solo búsqueda.
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(q) => q.id}
      searchText={(q) =>
        [q.customer?.full_name, q.service?.name].filter(Boolean).join(' ')
      }
      searchPlaceholder="Buscar por cliente o servicio…"
      empty={empty}
    />
  )
}
