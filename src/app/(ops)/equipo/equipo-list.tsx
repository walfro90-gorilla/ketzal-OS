'use client'

import { useMemo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList, type ListFilter } from '@/components/data/filterable-list'
import {
  MiembroAcciones,
  type AgenciaOption,
  type Miembro,
} from './miembro-acciones'

const ROLE_LABELS: Record<Miembro['role'], string> = {
  user: 'Agente',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

// Orden canónico para el filtro de rol (de menos a más privilegio).
const ROLE_ORDER: Miembro['role'][] = ['user', 'admin', 'superadmin']

function RolBadge({ role }: { role: Miembro['role'] }) {
  const variant =
    role === 'superadmin' ? 'default' : role === 'admin' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{ROLE_LABELS[role] ?? role}</Badge>
}

function EstadoBadge({ active }: { active: boolean }) {
  if (active) {
    return <Badge variant="success">Activo</Badge>
  }
  return <Badge variant="warning">Pendiente</Badge>
}

export function EquipoList({
  rows,
  agencias,
  isSuperadmin,
  empty,
}: {
  rows: Miembro[]
  agencias: AgenciaOption[]
  isSuperadmin: boolean
  empty: ReactNode
}) {
  // Las columnas dependen de agencias/isSuperadmin (props del servidor),
  // así que se construyen dentro del componente, no a nivel de módulo.
  const columns: DataColumn<Miembro>[] = [
    {
      header: 'Correo',
      primary: true,
      cell: (m) => m.email ?? '—',
      sortValue: (m) => m.email,
    },
    {
      header: 'Nombre',
      cell: (m) => m.name ?? '—',
      sortValue: (m) => m.name,
    },
    {
      header: 'Rol',
      cell: (m) => <RolBadge role={m.role} />,
      // Orden canónico por privilegio (Agente < Admin < Superadmin),
      // no alfabético.
      sortValue: (m) => ROLE_ORDER.indexOf(m.role),
    },
    {
      header: 'Vínculo',
      cell: (m) => m.agency ?? 'Libre',
      sortValue: (m) => m.agency,
    },
    {
      header: 'Estado',
      cell: (m) => <EstadoBadge active={m.active} />,
      // 0 = pendiente, 1 = activo.
      sortValue: (m) => (m.active ? 1 : 0),
    },
    {
      header: '# Ventas',
      align: 'right',
      cell: (m) => <span className="tabular-nums">{m.num_ventas}</span>,
      sortValue: (m) => m.num_ventas,
    },
    {
      header: 'Acciones',
      fullWidthOnCard: true,
      cell: (m) => (
        <MiembroAcciones
          miembro={m}
          agencias={agencias}
          isSuperadmin={isSuperadmin}
        />
      ),
    },
  ]

  const filters = useMemo<ListFilter<Miembro>[]>(() => {
    // Opciones del filtro de rol: los valores DISTINTOS presentes en los datos.
    const roles = Array.from(new Set(rows.map((m) => m.role))).sort(
      (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)
    )
    return [
      {
        key: 'estado',
        label: 'Estado',
        options: [
          { value: 'false', label: 'Pendiente' },
          { value: 'true', label: 'Activo' },
        ],
        getValue: (m) => String(m.active),
      },
      {
        key: 'rol',
        label: 'Rol',
        options: roles.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r })),
        getValue: (m) => m.role,
      },
    ]
  }, [rows])

  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(m) => m.id}
      searchText={(m) => [m.name, m.email].filter(Boolean).join(' ')}
      searchPlaceholder="Buscar por nombre o correo…"
      filters={filters}
      empty={empty}
    />
  )
}
