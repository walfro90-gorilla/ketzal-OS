'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Undo2Icon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { mxn } from '@/components/data/format'
import { revertirGasto } from './actions'
import type { GastoRow } from './data'

const CATEGORIA_LABELS: Record<string, string> = {
  operacion: 'Operación',
  transporte: 'Transporte',
  hospedaje: 'Hospedaje',
  alimentos: 'Alimentos',
  mayorista: 'Mayorista',
  marketing: 'Marketing',
  otro: 'Otro',
}

const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const fmtFecha = (d: string) => {
  const p = new Date(`${d}T12:00:00`)
  return Number.isNaN(p.getTime()) ? d : fecha.format(p)
}

function BotonRevertir({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')

  function confirmar() {
    startTransition(async () => {
      const res = await revertirGasto(id, motivo)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Gasto revertido')
      setAbierto(false)
      setMotivo('')
    })
  }

  if (!abierto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        <Undo2Icon className="size-4" />
        Revertir
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2">
      <Textarea
        autoFocus
        placeholder="Motivo del reverso…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="min-h-16 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierto(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={confirmar}
          disabled={isPending || !motivo.trim()}
        >
          {isPending ? 'Revirtiendo…' : 'Confirmar reverso'}
        </Button>
      </div>
    </div>
  )
}

export function GastosList({
  rows,
  empty,
}: {
  rows: GastoRow[]
  empty: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const reversados = useMemo(
    () => new Set(rows.map((r) => r.reverses_expense_id).filter(Boolean)),
    [rows]
  )

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.concept, CATEGORIA_LABELS[r.category] ?? r.category, r.provider_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const columns: DataColumn<GastoRow>[] = [
    {
      header: 'Fecha',
      cell: (g) => <span className="whitespace-nowrap">{fmtFecha(g.spent_at)}</span>,
    },
    {
      header: 'Concepto',
      primary: true,
      cell: (g) => (
        <div className="flex flex-col">
          <span>{g.concept}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {CATEGORIA_LABELS[g.category] ?? g.category}
            {g.provider_name ? ` · ${g.provider_name}` : ''}
            {g.kind === 'reverso' ? ' · Reverso' : ''}
          </span>
        </div>
      ),
    },
    {
      header: 'Método',
      cell: (g) => g.method ?? '—',
    },
    {
      header: 'Monto',
      align: 'right',
      cell: (g) => (
        <span
          className={`tabular-nums ${g.kind === 'reverso' ? 'text-muted-foreground' : 'font-medium'}`}
        >
          {g.kind === 'reverso' ? '−' : ''}
          {mxn.format(g.amount_mxn)}
        </span>
      ),
    },
    {
      header: 'Acciones',
      align: 'right',
      fullWidthOnCard: true,
      cell: (g) =>
        g.kind === 'egreso' && !reversados.has(g.id) ? (
          <BotonRevertir id={g.id} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Buscar gastos"
        placeholder="Buscar por concepto, categoría o proveedor…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 sm:max-w-xs sm:text-sm"
      />
      <DataList
        columns={columns}
        rows={filtradas}
        getRowKey={(g) => g.id}
        empty={empty}
      />
    </div>
  )
}
