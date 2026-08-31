'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LinkReferido } from '@/components/data/link-referido'
import { guardarReglaAgente, guardarCodigoReferido } from './reglas-actions'

export type AgenteComision = {
  id: string
  nombre: string
  pct: number | null
  porPasajero: number | null
  /** m010: código de referido, o null si no tiene. */
  codigo: string | null
}

/**
 * m010: el código de referido del agente. Un agente que compartía el link del
 * marketplace no cobraba nada — el motor solo resolvía códigos de embajador —
 * así que su recomendación se perdía. Con código, su referido paga la tarifa
 * de embajador de la agencia.
 *
 * Va aquí y no en /equipo porque la pregunta que responde es "cuánto le pago a
 * quién", que es de lo que trata esta pantalla.
 */
function CodigoReferido({ agente }: { agente: AgenteComision }) {
  const [isPending, startTransition] = useTransition()
  const [codigo, setCodigo] = useState(agente.codigo ?? '')

  function guardar() {
    startTransition(async () => {
      const res = await guardarCodigoReferido(agente.id, codigo || null)
      if ('error' in res) toast.error(res.error)
      else toast.success(codigo ? 'Código guardado' : 'Código quitado')
    })
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Código de referido</span>
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          aria-label={`Código de referido de ${agente.nombre}`}
          placeholder="Sin código"
          className="h-8 w-36 font-mono text-sm uppercase"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || codigo === (agente.codigo ?? '')}
          onClick={guardar}
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      {agente.codigo && <LinkReferido code={agente.codigo} compacto />}
    </div>
  )
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
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
      </div>
      <CodigoReferido agente={agente} />
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
