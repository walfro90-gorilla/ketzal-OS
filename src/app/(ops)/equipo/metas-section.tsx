'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mxn } from '@/components/data/format'
import { fijarMeta, quitarMeta } from './metas-actions'

export type MetaRow = {
  id: string | null // null = meta de la agencia
  nombre: string
  goal: number
  vendido: number
}

function avancePct(goal: number, vendido: number): number | null {
  return goal > 0 ? Math.round((vendido / goal) * 1000) / 10 : null
}

function Fila({ row }: { row: MetaRow }) {
  const [valor, setValor] = useState(row.goal > 0 ? String(row.goal) : '')
  const [isPending, startTransition] = useTransition()
  const avance = avancePct(row.goal, row.vendido)
  const cumplida = avance != null && avance >= 100

  function guardar() {
    const n = Number(valor)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Escribe una meta mayor que cero.')
      return
    }
    startTransition(async () => {
      const res = await fijarMeta(row.id, n)
      if ('error' in res) toast.error(res.error)
      else toast.success('Meta guardada')
    })
  }
  function quitar() {
    startTransition(async () => {
      const res = await quitarMeta(row.id)
      if ('error' in res) toast.error(res.error)
      else {
        setValor('')
        toast.success('Meta quitada')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium">{row.nombre}</p>
        <p className="text-xs text-muted-foreground">
          Vendido: {mxn.format(row.vendido)}
          {avance != null && (
            <span className={cumplida ? ' text-emerald-700 dark:text-emerald-400' : ''}>
              {' '}· {avance}%
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="100"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Meta MXN"
          className="h-9 w-32"
          aria-label={`Meta de ${row.nombre}`}
        />
        <Button size="sm" onClick={guardar} disabled={isPending}>
          Guardar
        </Button>
        {row.goal > 0 && (
          <Button size="sm" variant="ghost" onClick={quitar} disabled={isPending}>
            Quitar
          </Button>
        )}
      </div>
    </div>
  )
}

export function MetasSection({
  month,
  agencia,
  agentes,
}: {
  month: string
  agencia: MetaRow
  agentes: MetaRow[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas del mes ({month})</CardTitle>
        <CardDescription>
          Fija la meta de venta de la agencia y de cada agente. El avance se
          calcula con lo vendido en el mes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Fila row={agencia} />
        {agentes.map((a) => (
          <Fila key={a.id ?? 'agencia'} row={a} />
        ))}
        {agentes.length === 0 && (
          <p className="pt-2 text-sm text-muted-foreground">
            No hay agentes para fijarles meta.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
