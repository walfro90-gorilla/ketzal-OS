'use client'

import { useMemo, type ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList, type ListFilter } from '@/components/data/filterable-list'
import { mxn } from '../ventas/ui'
import { PublicarToggle } from './publicar-toggle'

const TIPO_LABELS: Record<string, string> = {
  tour: 'Tour',
  paquete: 'Paquete',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  actividad: 'Actividad',
}

function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

/** "{ciudad}, {estado}" con lo que haya; "—" si no hay nada. */
function formatDestino(city: string | null, state: string | null): string {
  const partes = [city, state].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '—'
}

// Fila ya enriquecida por el server page con el nombre de la agencia dueña
// (el Map supplier_id → nombre vive en el servidor; aquí llega plano).
export type Servicio = {
  id: string
  name: string
  price: number | null
  service_type: string | null
  state_to: string | null
  city_to: string | null
  max_capacity: number | null
  supplier_id: string
  agencia: string | null
  published: boolean
}

const columns: DataColumn<Servicio>[] = [
  {
    header: 'Nombre',
    primary: true,
    cell: (s) => (
      <div className="flex flex-col">
        <span>{s.name}</span>
        {s.service_type && (
          <span className="text-xs font-normal text-muted-foreground">
            {tipoLabel(s.service_type)}
          </span>
        )}
      </div>
    ),
    sortValue: (s) => s.name,
  },
  {
    header: 'Agencia',
    cell: (s) => s.agencia ?? <span className="text-muted-foreground">—</span>,
    sortValue: (s) => s.agencia,
  },
  {
    header: 'Destino',
    cell: (s) => formatDestino(s.city_to, s.state_to),
    // null (no "—") para que los servicios sin destino queden al final.
    sortValue: (s) => (s.city_to || s.state_to ? formatDestino(s.city_to, s.state_to) : null),
  },
  {
    header: 'Precio',
    align: 'right',
    cell: (s) => (
      <span className="tabular-nums">{mxn.format(Number(s.price ?? 0))}</span>
    ),
    // La celda muestra $0.00 cuando no hay precio ⇒ ordenamos igual que se ve.
    sortValue: (s) => Number(s.price ?? 0),
  },
  {
    header: 'Cupo',
    align: 'right',
    cell: (s) =>
      s.max_capacity != null ? (
        <span className="tabular-nums">{s.max_capacity}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    sortValue: (s) => s.max_capacity,
  },
  {
    header: 'Catálogo',
    cell: (s) => <PublicarToggle id={s.id} publicado={s.published} />,
    // Publicados primero al ordenar.
    sortValue: (s) => (s.published ? 0 : 1),
  },
]

export function ServiciosList({
  rows,
  empty,
}: {
  rows: Servicio[]
  empty: ReactNode
}) {
  // Opciones del filtro de tipo: los valores DISTINTOS presentes en los datos.
  const filters = useMemo<ListFilter<Servicio>[]>(() => {
    const tipos = Array.from(
      new Set(rows.map((s) => s.service_type).filter((t): t is string => !!t))
    ).sort()
    if (tipos.length === 0) return []
    return [
      {
        key: 'tipo',
        label: 'Tipo',
        options: tipos.map((t) => ({ value: t, label: tipoLabel(t) })),
        getValue: (s) => s.service_type,
      },
    ]
  }, [rows])

  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(s) => s.id}
      rowHref={(s) => `/servicios/${s.id}`}
      searchText={(s) =>
        [s.name, s.city_to, s.state_to].filter(Boolean).join(' ')
      }
      searchPlaceholder="Buscar por nombre o destino…"
      filters={filters}
      empty={empty}
    />
  )
}
