'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { fmtFechaSalida, type Salida } from './tipos'

export function SalidasList({
  rows,
  empty,
}: {
  rows: Salida[]
  empty: React.ReactNode
}) {
  const [query, setQuery] = useState('')

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.service.toLowerCase().includes(q))
  }, [rows, query])

  const columns: DataColumn<Salida>[] = [
    {
      header: 'Salida',
      primary: true,
      cell: (s) => (
        <Link href={`/salidas/${s.id}`} className="flex flex-col hover:underline">
          <span>{s.service}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {fmtFechaSalida(s.departs_on)}
          </span>
        </Link>
      ),
    },
    {
      header: 'Ocupación',
      align: 'right',
      cell: (s) => {
        const lleno = s.seats_taken >= s.max_capacity
        return (
          <span
            className={`tabular-nums ${lleno ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
          >
            {s.seats_taken}/{s.max_capacity}
            {lleno && ' · lleno'}
          </span>
        )
      },
    },
    {
      header: 'Pasajeros',
      align: 'right',
      cell: (s) => {
        const completo = s.pax_capturados >= s.seats_taken && s.seats_taken > 0
        return (
          <span
            className={`tabular-nums ${
              completo
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {s.pax_capturados}/{s.seats_taken}
          </span>
        )
      },
    },
    {
      header: 'Ventas',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{s.num_ventas}</span>,
    },
  ]

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Buscar salidas"
        placeholder="Buscar por servicio…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 sm:max-w-xs sm:text-sm"
      />
      <DataList columns={columns} rows={filtradas} getRowKey={(s) => s.id} empty={empty} />
    </div>
  )
}
