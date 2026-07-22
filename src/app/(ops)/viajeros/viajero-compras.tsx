'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ShoppingBagIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { mxn } from '@/components/data/format'

// Compras de un viajero (bookings ligados por marketplace_customer_id). Dinero
// derivado del RPC list_traveler_purchases. Filtro por estado + último abono;
// cada fila enlaza al detalle de la venta.

export type Compra = {
  id: string
  folio: string | null
  service: string | null
  agency: string | null
  travel_date: string | null
  status: string
  total: number
  cobrado: number
  saldo: number
  ultimo_pago: string | null
  num_pagos: number
  created_at: string
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-muted text-muted-foreground' },
  reserved: { label: 'Reservada', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  confirmed: { label: 'Confirmada', cls: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' },
  paid: { label: 'Pagada', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-destructive/10 text-destructive' },
}
// Orden canónico de los estados para los chips del filtro.
const ORDEN = ['draft', 'reserved', 'confirmed', 'paid', 'cancelled']

const fFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const fmtFecha = (d: string | null) => {
  if (!d) return '—'
  const p = new Date(d.length <= 10 ? `${d}T12:00:00` : d)
  return Number.isNaN(p.getTime()) ? d : fFecha.format(p)
}

const columns: DataColumn<Compra>[] = [
  {
    header: 'Servicio',
    primary: true,
    cell: (c) => (
      <Link href={`/ventas/${c.id}`} className="flex flex-col hover:underline">
        <span>{c.service ?? 'Servicio'}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {c.agency ?? '—'}
          {c.folio ? ` · ${c.folio}` : ''}
        </span>
      </Link>
    ),
  },
  {
    header: 'Fecha viaje',
    cell: (c) => <span className="whitespace-nowrap">{fmtFecha(c.travel_date)}</span>,
  },
  {
    header: 'Total',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{mxn.format(Number(c.total))}</span>,
  },
  {
    header: 'Cobrado',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{mxn.format(Number(c.cobrado))}</span>,
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (c) => (
      <span
        className={`font-semibold tabular-nums ${
          Number(c.saldo) > 0 ? 'text-amber-700 dark:text-amber-400' : ''
        }`}
      >
        {mxn.format(Number(c.saldo))}
      </span>
    ),
  },
  {
    header: 'Último pago',
    cell: (c) =>
      c.num_pagos > 0 ? (
        <div className="flex flex-col">
          <span className="whitespace-nowrap">{fmtFecha(c.ultimo_pago)}</span>
          <span className="text-xs text-muted-foreground">
            {c.num_pagos === 1 ? '1 abono' : `${c.num_pagos} abonos`}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Sin pagos</span>
      ),
  },
  {
    header: 'Estado',
    cell: (c) => {
      const e = ESTADO[c.status] ?? { label: c.status, cls: 'bg-muted text-muted-foreground' }
      return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>
          {e.label}
        </span>
      )
    },
  },
]

export function ViajeroCompras({ rows }: { rows: Compra[] }) {
  const [estado, setEstado] = useState<string>('todos')

  // Solo mostramos chips de estados presentes (+ "Todos"), con su conteo.
  const conteos = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of rows) m.set(c.status, (m.get(c.status) ?? 0) + 1)
    return m
  }, [rows])

  const estadosPresentes = useMemo(
    () => ORDEN.filter((s) => conteos.has(s)),
    [conteos]
  )

  const filtradas = useMemo(
    () => (estado === 'todos' ? rows : rows.filter((c) => c.status === estado)),
    [rows, estado]
  )

  return (
    <div className="space-y-3">
      {estadosPresentes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FiltroChip
            activo={estado === 'todos'}
            onClick={() => setEstado('todos')}
            label={`Todos (${rows.length})`}
          />
          {estadosPresentes.map((s) => (
            <FiltroChip
              key={s}
              activo={estado === s}
              onClick={() => setEstado(s)}
              label={`${ESTADO[s]?.label ?? s} (${conteos.get(s)})`}
            />
          ))}
        </div>
      )}
      <DataList
        columns={columns}
        rows={filtradas}
        getRowKey={(c) => c.id}
        empty={
          <EmptyState
            icon={ShoppingBagIcon}
            title={estado === 'todos' ? 'Aún no tiene compras' : 'Sin compras en este estado'}
            description={
              estado === 'todos'
                ? 'Cuando este viajero haga un pedido en el marketplace aparecerá aquí.'
                : 'Prueba con otro estado o quita el filtro.'
            }
          />
        }
      />
    </div>
  )
}

function FiltroChip({
  activo,
  onClick,
  label,
}: {
  activo: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        activo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}
