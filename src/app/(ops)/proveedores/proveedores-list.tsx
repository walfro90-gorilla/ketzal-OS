'use client'

import { useMemo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList, type ListFilter } from '@/components/data/filterable-list'

const TIPO_LABELS: Record<string, string> = {
  agency: 'Agencia',
  tour_operator: 'Tour operador',
  transport: 'Transporte',
  transporte: 'Transporte',
  hotel: 'Hotel',
  embajador: 'Embajador',
  otro: 'Otro',
}

/** "tour_guide" → "Tour guide": mapea los conocidos, capitaliza el resto. */
function tipoLabel(tipo: string): string {
  const conocido = TIPO_LABELS[tipo]
  if (conocido) return conocido
  const limpio = tipo.replace(/_/g, ' ')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/** Las agencias (los tenants vendedores) son las que cobran comisión. */
function esAgencia(tipo: string | null): boolean {
  return tipo === 'agency' || tipo === 'tour_operator'
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  const label = tipo ? tipoLabel(tipo) : 'Otro'
  return (
    <Badge variant={esAgencia(tipo) ? 'default' : 'secondary'}>{label}</Badge>
  )
}

export type ProveedorRow = {
  id: string
  name: string
  supplier_type: string | null
  contact_email: string | null
  phone_number: string | null
  commission_rate: number | null
}

const columns: DataColumn<ProveedorRow>[] = [
  {
    header: 'Nombre',
    primary: true,
    cell: (p) => p.name,
    sortValue: (p) => p.name,
  },
  {
    header: 'Tipo',
    cell: (p) => <TipoBadge tipo={p.supplier_type} />,
    // Etiqueta visible (no el valor crudo): el orden alfabético coincide
    // con lo que el usuario lee en el badge.
    sortValue: (p) => (p.supplier_type ? tipoLabel(p.supplier_type) : null),
  },
  {
    header: 'Contacto',
    cell: (p) =>
      p.contact_email || p.phone_number ? (
        <div className="flex flex-col text-xs text-muted-foreground">
          {p.contact_email && <span>{p.contact_email}</span>}
          {p.phone_number && <span>{p.phone_number}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Comisión',
    align: 'right',
    cell: (p) =>
      esAgencia(p.supplier_type) ? (
        <span className="tabular-nums">{Number(p.commission_rate ?? 0)}%</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
]

export function ProveedoresList({
  rows,
  empty,
}: {
  rows: ProveedorRow[]
  empty: ReactNode
}) {
  // Opciones del filtro de tipo: los valores DISTINTOS presentes en los datos.
  const filters = useMemo<ListFilter<ProveedorRow>[]>(() => {
    const tipos = Array.from(
      new Set(rows.map((p) => p.supplier_type).filter((t): t is string => !!t))
    ).sort()
    if (tipos.length === 0) return []
    return [
      {
        key: 'tipo',
        label: 'Tipo',
        options: tipos.map((t) => ({ value: t, label: tipoLabel(t) })),
        getValue: (p) => p.supplier_type,
      },
    ]
  }, [rows])

  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(p) => p.id}
      rowHref={(p) => `/proveedores/${p.id}`}
      searchText={(p) =>
        [p.name, p.contact_email, p.phone_number].filter(Boolean).join(' ')
      }
      searchPlaceholder="Buscar por nombre, correo o teléfono…"
      filters={filters}
      empty={empty}
    />
  )
}
