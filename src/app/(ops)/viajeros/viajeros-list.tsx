'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { Button, buttonVariants } from '@/components/ui/button'
import { eliminarViajero } from './actions'

// Viajeros = compradores B2C del marketplace (ketzal.marketplace_customers).
// Solo el god admin los administra, vía RPC/acciones con service role.

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

function BotonEliminar({ viajero }: { viajero: Viajero }) {
  const [isPending, startTransition] = useTransition()
  function onClick() {
    if (viajero.num_compras > 0) {
      toast.error(
        `No se puede eliminar: ${viajero.full_name} tiene ${viajero.num_compras} compra(s).`
      )
      return
    }
    if (
      !window.confirm(
        `¿Eliminar a ${viajero.full_name}? Se borra su cuenta de comprador. Esta acción no se puede deshacer.`
      )
    )
      return
    startTransition(async () => {
      const res = await eliminarViajero(viajero.id)
      if ('error' in res) toast.error(res.error)
      else toast.success('Viajero eliminado')
    })
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      className="text-destructive hover:text-destructive"
    >
      <Trash2Icon className="size-4" />
      {isPending ? 'Eliminando…' : 'Eliminar'}
    </Button>
  )
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
    {
      header: 'Acciones',
      align: 'right',
      fullWidthOnCard: true,
      cell: (v) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/viajeros/${v.id}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <PencilIcon className="size-4" />
            Editar
          </Link>
          <BotonEliminar viajero={v} />
        </div>
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
