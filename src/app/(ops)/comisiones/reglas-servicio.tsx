'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { mxn } from '@/components/data/format'
import {
  guardarReglaEmbajador,
  guardarReglaPlataforma,
  type ReglaBasis,
} from './reglas-actions'

type OnSave = (
  basis: ReglaBasis,
  value: number | null
) => Promise<{ error: string } | { ok: true }>

type Opcion = { value: ReglaBasis; label: string }

// ----- Fila genérica editable (una regla por servicio) -----------------------
function ReglaRow({
  titulo,
  subtitulo,
  prefijo,
  initialBasis,
  initialValue,
  opciones,
  resumen,
  onSave,
}: {
  titulo: string
  subtitulo?: string | null
  /** Etiqueta del resumen a la izquierda: "Ketzal gana" | "Tarifa". */
  prefijo: string
  initialBasis: ReglaBasis
  initialValue: number | null
  opciones: Opcion[]
  resumen: (basis: ReglaBasis, value: number | null) => string
  onSave: OnSave
}) {
  const [isPending, startTransition] = useTransition()
  const [basis, setBasis] = useState<ReglaBasis>(initialBasis)
  const [value, setValue] = useState(initialValue != null ? String(initialValue) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ basis: ReglaBasis; value: number | null }>({
    basis: initialBasis,
    value: initialValue,
  })

  const needsValue = basis === 'percent' || basis === 'fijo_venta' || basis === 'fijo_pax'
  const isPct = basis === 'percent'

  function handleSave() {
    setError(null)
    const parsed = needsValue ? Number(value) : null
    startTransition(async () => {
      const result = await onSave(basis, needsValue ? parsed : null)
      if ('error' in result) {
        setError(result.error)
      } else {
        setSaved({ basis, value: needsValue ? parsed : null })
        toast.success('Regla actualizada')
      }
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          {subtitulo ? `${subtitulo} · ` : ''}
          {prefijo}: {resumen(saved.basis, saved.value)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={basis}
          onChange={(e) => setBasis(e.target.value as ReglaBasis)}
          aria-label="Modo de comisión"
          className="w-40"
        >
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>

        {needsValue && (
          <div className="relative">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={isPct ? 100 : undefined}
              step={isPct ? '0.5' : '1'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Valor de la regla"
              className="w-28 pr-7 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
              {isPct ? '%' : '$'}
            </span>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </li>
  )
}

// ----- Editor de ganancia de PLATAFORMA por servicio -------------------------
export type ReglaServicio = {
  serviceId: string
  nombre: string
  agencia: string | null
  basis: ReglaBasis
  value: number | null
}

const OPCIONES_PLATAFORMA: Opcion[] = [
  { value: 'global', label: 'Usar % global' },
  { value: 'percent', label: '% propio' },
  { value: 'fijo_venta', label: 'Fijo por venta' },
  { value: 'fijo_pax', label: 'Fijo por pasajero' },
]

export function ReglasServicio({
  reglas,
  globalRate,
  showAgencia,
}: {
  reglas: ReglaServicio[]
  globalRate: number
  showAgencia: boolean
}) {
  if (reglas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay servicios para configurar.
      </p>
    )
  }
  const resumen = (basis: ReglaBasis, value: number | null) => {
    if (basis === 'percent') return `${value}%`
    if (basis === 'fijo_venta') return `${mxn.format(Number(value ?? 0))} por venta`
    if (basis === 'fijo_pax') return `${mxn.format(Number(value ?? 0))} por pasajero`
    return `Global (${globalRate}%)`
  }
  return (
    <ul className="divide-y">
      {reglas.map((r) => (
        <ReglaRow
          key={r.serviceId}
          titulo={r.nombre}
          subtitulo={showAgencia ? r.agencia : null}
          prefijo="Ketzal gana"
          initialBasis={r.basis}
          initialValue={r.value}
          opciones={OPCIONES_PLATAFORMA}
          resumen={resumen}
          onSave={(basis, value) => guardarReglaPlataforma(r.serviceId, basis, value)}
        />
      ))}
    </ul>
  )
}

// ----- Editor de TARIFAS DE EMBAJADOR por servicio ---------------------------
export type Embajador = { id: string; nombre: string; codigo: string | null }
export type ServicioBasico = { id: string; nombre: string; agencia: string | null }
export type ReglaEmbajadorRow = {
  embajadorId: string
  serviceId: string
  basis: ReglaBasis
  value: number | null
}

const OPCIONES_EMBAJADOR: Opcion[] = [
  { value: 'global', label: 'Sin tarifa' },
  { value: 'fijo_pax', label: 'Fijo por pasajero' },
  { value: 'fijo_venta', label: 'Fijo por venta' },
  { value: 'percent', label: '% de la venta' },
]

function resumenEmbajador(basis: ReglaBasis, value: number | null): string {
  if (basis === 'percent') return `${value}% de la venta`
  if (basis === 'fijo_venta') return `${mxn.format(Number(value ?? 0))} por venta`
  if (basis === 'fijo_pax') return `${mxn.format(Number(value ?? 0))} por pasajero`
  return 'Sin tarifa (no atribuye)'
}

export function ReglasEmbajador({
  embajadores,
  servicios,
  reglas,
}: {
  embajadores: Embajador[]
  servicios: ServicioBasico[]
  reglas: ReglaEmbajadorRow[]
}) {
  const [sel, setSel] = useState(embajadores[0]?.id ?? '')

  if (embajadores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay embajadores. Créalos en Proveedores (tipo Embajador) y aquí podrás
        fijar su tarifa por servicio.
      </p>
    )
  }
  if (servicios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No hay servicios para configurar.</p>
    )
  }

  // Regla vigente por (embajador, servicio).
  const reglaDe = new Map(
    reglas.map((r) => [`${r.embajadorId}:${r.serviceId}`, r])
  )

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-2">
        <label htmlFor="emb-sel" className="text-sm font-medium">
          Embajador
        </label>
        <NativeSelect
          id="emb-sel"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          {embajadores.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.codigo ? ` (${e.codigo})` : ''}
            </option>
          ))}
        </NativeSelect>
      </div>

      <ul className="divide-y">
        {servicios.map((s) => {
          const r = reglaDe.get(`${sel}:${s.id}`)
          return (
            <ReglaRow
              // key incluye el embajador ⇒ remonta al cambiar de embajador y
              // toma la regla vigente de ese embajador como valor inicial.
              key={`${sel}:${s.id}`}
              titulo={s.nombre}
              subtitulo={s.agencia}
              prefijo="Tarifa"
              initialBasis={r ? r.basis : 'global'}
              initialValue={r ? r.value : null}
              opciones={OPCIONES_EMBAJADOR}
              resumen={resumenEmbajador}
              onSave={(basis, value) => guardarReglaEmbajador(sel, s.id, basis, value)}
            />
          )
        })}
      </ul>
    </div>
  )
}
