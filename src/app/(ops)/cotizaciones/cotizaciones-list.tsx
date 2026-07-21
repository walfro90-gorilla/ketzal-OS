'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { mxn } from '@/components/data/format'
import { CotizacionAcciones } from './cotizacion-acciones'

export type QuoteRow = {
  id: string
  quote_token: string
  /** Folio de cotización (COT-n). Opcional: la columna puede no existir aún. */
  quote_folio?: number | null
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
      cell: (q) => (
        <div className="flex flex-col">
          <span>{q.customer?.full_name ?? 'Sin cliente'}</span>
          {q.quote_folio != null && (
            <span className="text-xs font-normal text-muted-foreground">
              COT-{q.quote_folio}
            </span>
          )}
        </div>
      ),
      sortValue: (q) => q.customer?.full_name,
    },
    {
      header: 'Servicio',
      cell: (q) => q.service?.name ?? 'A medida',
      sortValue: (q) => q.service?.name,
    },
    {
      header: 'Total (MXN)',
      align: 'right',
      cell: (q) => (
        <span className="tabular-nums">{mxn.format(Number(q.total))}</span>
      ),
      sortValue: (q) => Number(q.total),
    },
    {
      header: 'Creada',
      cell: (q) => createdAtFormatter.format(new Date(q.created_at)),
      sortValue: (q) => q.created_at,
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
        [
          q.customer?.full_name,
          q.service?.name,
          q.quote_folio != null ? `COT-${q.quote_folio}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      }
      searchPlaceholder="Buscar por cliente, servicio o folio…"
      empty={empty}
    />
  )
}
