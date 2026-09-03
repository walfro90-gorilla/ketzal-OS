'use client'

import type { ReactNode } from 'react'
import type { DataColumn } from '@/components/data/data-list'
import { FilterableList } from '@/components/data/filterable-list'
import { Badge } from '@/components/ui/badge'
import { fmtFecha } from '@/components/data/format'

export type UsuarioRow = {
  id: string
  nombre: string | null
  email: string | null
  rol: 'user' | 'admin' | 'superadmin' | null
  tipo: 'agente' | 'viajero' | 'embajador' | 'proveedor' | null
  activo: boolean | null
  agencia: string | null
  creada: string
  ultimo_acceso: string | null
  /** Tiene perfil pero ya no existe en Auth: no puede entrar. */
  sin_cuenta_auth: boolean
}

const TIPO_LABEL: Record<string, string> = {
  agente: 'Agente',
  viajero: 'Viajero',
  embajador: 'Embajador',
  proveedor: 'Proveedor',
}

const ROL_LABEL: Record<string, string> = {
  user: 'Agente',
  admin: 'Admin',
  superadmin: 'God admin',
}

const columns: DataColumn<UsuarioRow>[] = [
  {
    header: 'Persona',
    primary: true,
    cell: (u) => (
      <div className="flex flex-col">
        <span>{u.nombre || 'Sin nombre'}</span>
        {u.email && (
          <span className="text-xs text-muted-foreground">{u.email}</span>
        )}
      </div>
    ),
    sortValue: (u) => u.nombre ?? u.email ?? '',
  },
  {
    header: 'Tipo',
    cell: (u) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">{TIPO_LABEL[u.tipo ?? ''] ?? '—'}</Badge>
        {u.rol && u.rol !== 'user' && (
          <Badge variant="outline">{ROL_LABEL[u.rol]}</Badge>
        )}
      </div>
    ),
    sortValue: (u) => u.tipo ?? '',
  },
  {
    header: 'Agencia',
    cell: (u) => u.agencia ?? <span className="text-muted-foreground">—</span>,
    sortValue: (u) => u.agencia ?? '',
  },
  {
    header: 'Estado',
    cell: (u) =>
      u.sin_cuenta_auth ? (
        <Badge variant="destructive">Sin cuenta</Badge>
      ) : u.activo ? (
        <Badge variant="secondary">Activa</Badge>
      ) : (
        <Badge variant="warning">Pendiente</Badge>
      ),
    sortValue: (u) => (u.activo ? 1 : 0),
  },
  {
    header: 'Último acceso',
    align: 'right',
    cell: (u) => (
      <span className="text-xs text-muted-foreground">
        {fmtFecha(u.ultimo_acceso)}
      </span>
    ),
    sortValue: (u) => u.ultimo_acceso ?? '',
  },
  {
    header: 'Alta',
    align: 'right',
    cell: (u) => (
      <span className="text-xs text-muted-foreground">{fmtFecha(u.creada)}</span>
    ),
    sortValue: (u) => u.creada,
  },
]

export function UsuariosList({
  rows,
  empty,
}: {
  rows: UsuarioRow[]
  empty?: ReactNode
}) {
  return (
    <FilterableList
      rows={rows}
      columns={columns}
      getRowKey={(u) => u.id}
      rowHref={(u) => `/usuarios/${u.id}`}
      searchText={(u) => `${u.nombre ?? ''} ${u.email ?? ''} ${u.agencia ?? ''}`}
      searchPlaceholder="Buscar por nombre, correo o agencia…"
      filters={[
        {
          key: 'tipo',
          label: 'Tipo',
          options: Object.entries(TIPO_LABEL).map(([value, label]) => ({
            value,
            label,
          })),
          getValue: (u) => u.tipo,
        },
        {
          key: 'rol',
          label: 'Rol',
          options: Object.entries(ROL_LABEL).map(([value, label]) => ({
            value,
            label,
          })),
          getValue: (u) => u.rol,
        },
      ]}
      empty={empty}
    />
  )
}
