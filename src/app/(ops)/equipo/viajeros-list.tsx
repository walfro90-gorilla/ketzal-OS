'use client'

import { useMemo, useState } from 'react'
import { DataList, type DataColumn } from '@/components/data/data-list'

// Viajeros = compradores B2C del marketplace (ketzal.marketplace_customers).
// Solo el god admin los ve, vía el RPC list_travelers (SECURITY DEFINER). Vista
// de solo lectura: aquí no se aprueban ni se les asigna agencia (no son agentes).

export type Viajero = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  num_compras: number
}

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const fmtFecha = (d: string) => {
  const p = new Date(d)
  return Number.isNaN(p.getTime()) ? d : fecha.format(p)
}

export function ViajerosList({
  rows,
  empty,
}: {
  rows: Viajero[]
  empty: React.ReactNode
}) {
  const [query, setQuery] = useState('')

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.full_name, r.email, r.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const columns: DataColumn<Viajero>[] = [
    {
      header: 'Nombre',
      primary: true,
      cell: (v) => (
        <div className="flex flex-col">
          <span>{v.full_name}</span>
          {v.email && (
            <span className="text-xs font-normal text-muted-foreground">
              {v.email}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Teléfono',
      cell: (v) => v.phone ?? '—',
    },
    {
      header: 'Compras',
      align: 'right',
      cell: (v) => <span className="tabular-nums">{v.num_compras}</span>,
    },
    {
      header: 'Registrado',
      cell: (v) => (
        <span className="whitespace-nowrap">{fmtFecha(v.created_at)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Buscar viajeros"
        placeholder="Buscar por nombre, correo o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 sm:max-w-xs sm:text-sm"
      />
      <DataList
        columns={columns}
        rows={filtradas}
        getRowKey={(v) => v.id}
        empty={empty}
      />
    </div>
  )
}
