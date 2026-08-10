'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { guardarReglaAgente } from './reglas-actions'

export type AgenteComision = {
  id: string
  nombre: string
  pct: number | null
  porPasajero: number | null
}

// b054: tarifa de comisión por agente (una sola, no por servicio como
// embajador/plataforma) — % de la venta + fijo por pasajero, los DOS a la
// vez (basis 'hibrido'). La paga la propia agencia de su margen.
function FilaAgente({ agente }: { agente: AgenteComision }) {
  const [isPending, startTransition] = useTransition()
  const [pct, setPct] = useState(agente.pct != null ? String(agente.pct) : '')
  const [porPasajero, setPorPasajero] = useState(
    agente.porPasajero != null ? String(agente.porPasajero) : ''
  )
  const [error, setError] = useState<string | null>(null)
  const tieneTarifa = agente.pct != null || agente.porPasajero != null

  function guardar() {
    setError(null)
    startTransition(async () => {
      const res = await guardarReglaAgente(agente.id, Number(pct), Number(porPasajero))
      if ('error' in res) toast.error(res.error)
      else toast.success('Tarifa actualizada')
    })
  }

  function quitar() {
    setError(null)
    setPct('')
    setPorPasajero('')
    startTransition(async () => {
      const res = await guardarReglaAgente(agente.id, null, null)
      if ('error' in res) toast.error(res.error)
      else toast.success('Tarifa quitada')
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{agente.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {tieneTarifa
            ? `${agente.pct}% + $${agente.porPasajero} por pasajero`
            : 'Sin tarifa (no genera comisión)'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.5"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            aria-label="Porcentaje de la venta"
            placeholder="0"
            className="w-20 pr-6 text-right tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
            %
          </span>
        </div>
        <span className="text-muted-foreground">+</span>
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={porPasajero}
            onChange={(e) => setPorPasajero(e.target.value)}
            aria-label="Monto fijo por pasajero"
            placeholder="0"
            className="w-24 pl-5 text-right tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-muted-foreground">
            $
          </span>
        </div>
        <span className="text-xs text-muted-foreground">/pax</span>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={guardar}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {tieneTarifa && (
          <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={quitar}>
            Quitar
          </Button>
        )}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </li>
  )
}

export function ReglasAgente({ agentes }: { agentes: AgenteComision[] }) {
  if (agentes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay agentes en tu equipo. Invítalos desde /equipo y aquí podrás
        fijarles una comisión por cerrar ventas.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {agentes.map((a) => (
        <FilaAgente key={a.id} agente={a} />
      ))}
    </ul>
  )
}
