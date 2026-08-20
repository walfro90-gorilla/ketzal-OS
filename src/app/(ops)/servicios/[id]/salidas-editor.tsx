'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PACK_TYPES, type Pack } from '@/lib/domain/packs'
import {
  actualizarSalida,
  crearSalida,
  eliminarSalida,
  listarSalidas,
  type PackPriceOverrides,
  type Salida,
} from '../actions'

/** YYYY-MM-DD → fecha legible en es-MX (anclada al mediodía, sin corrimiento). */
function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function SalidasEditor({
  serviceId,
  initial,
  packs,
}: {
  serviceId: string
  initial: Salida[]
  /** Paquetes del servicio: acota qué packs se pueden dar precio especial (b057). */
  packs: Pack[]
}) {
  const [salidas, setSalidas] = useState<Salida[]>(initial)
  const [fecha, setFecha] = useState('')
  const [cupo, setCupo] = useState('')
  // b045: ajuste de temporada en % (vacío = 0 = precio normal).
  const [pct, setPct] = useState('')
  // b057: precios especiales por pack para la salida nueva (vacío = usa el %).
  const [overridesNueva, setOverridesNueva] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const packKeys = packs.map((p) => p.key)
  const packsDisponibles = PACK_TYPES.filter((t) => packKeys.includes(t.key))

  async function refrescar() {
    const res = await listarSalidas(serviceId)
    if ('salidas' in res) setSalidas(res.salidas)
  }

  function agregar() {
    setError(null)
    if (!fecha) {
      setError('Elige la fecha de salida.')
      return
    }
    const n = Number(cupo)
    if (!Number.isInteger(n) || n < 1) {
      setError('El cupo debe ser un entero mayor a 0.')
      return
    }
    startTransition(async () => {
      const res = await crearSalida(serviceId, {
        departs_on: fecha,
        max_capacity: n,
        price_pct: pct.trim() === '' ? 0 : Number(pct),
        pack_price_overrides: overridesNueva,
      })
      if ('error' in res) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      setFecha('')
      setCupo('')
      setPct('')
      setOverridesNueva({})
      await refrescar()
      toast.success('Salida agregada')
    })
  }

  function guardarCupo(s: Salida, valor: string) {
    const n = Number(valor)
    if (n === s.max_capacity) return // sin cambio
    if (!Number.isInteger(n) || n < 1) {
      toast.error('El cupo debe ser un entero mayor a 0.')
      return
    }
    startTransition(async () => {
      const res = await actualizarSalida(s.id, {
        departs_on: s.departs_on,
        max_capacity: n,
        price_pct: s.price_pct,
      })
      if ('error' in res) {
        toast.error(res.error)
        await refrescar() // revierte el input al valor real
        return
      }
      await refrescar()
      toast.success('Cupo actualizado')
    })
  }

  function guardarPct(s: Salida, valor: string) {
    const n = valor.trim() === '' ? 0 : Number(valor)
    if (n === s.price_pct) return // sin cambio
    if (!Number.isFinite(n) || n <= -100 || n > 500) {
      toast.error('El ajuste debe estar entre -99% y 500%.')
      return
    }
    startTransition(async () => {
      const res = await actualizarSalida(s.id, {
        departs_on: s.departs_on,
        max_capacity: s.max_capacity,
        price_pct: n,
      })
      if ('error' in res) {
        toast.error(res.error)
        await refrescar()
        return
      }
      await refrescar()
      toast.success('Ajuste de precio actualizado')
    })
  }

  /** b057: guarda/quita el precio especial de un pack en una salida existente. */
  function guardarOverride(s: Salida, packKey: string, valor: string) {
    const actual: PackPriceOverrides = { ...(s.pack_price_overrides ?? {}) }
    if (valor.trim() === '') {
      delete actual[packKey]
    } else {
      const n = Number(valor)
      if (!Number.isFinite(n) || n <= 0) {
        toast.error('El precio especial debe ser mayor a 0.')
        return
      }
      actual[packKey] = n
    }
    startTransition(async () => {
      const res = await actualizarSalida(s.id, {
        departs_on: s.departs_on,
        max_capacity: s.max_capacity,
        price_pct: s.price_pct,
        pack_price_overrides: actual,
      })
      if ('error' in res) {
        toast.error(res.error)
        await refrescar()
        return
      }
      await refrescar()
      toast.success('Precio especial actualizado')
    })
  }

  function borrar(id: string) {
    startTransition(async () => {
      const res = await eliminarSalida(id)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      await refrescar()
      toast.success('Salida eliminada')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salidas y cupo</CardTitle>
        <CardDescription>
          Cada fecha con su cupo. Al vender, el lugar se descuenta de la salida y
          se bloquea al agotarse. Sin salidas, el servicio se vende sin tope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {salidas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin salidas todavía.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {salidas.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {fechaLarga(s.departs_on)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.seats_taken} vendidos · {s.remaining} libres
                    {s.price_pct !== 0 && (
                      <span
                        className={
                          s.price_pct > 0
                            ? ' ml-1 font-semibold text-amber-600 dark:text-amber-500'
                            : ' ml-1 font-semibold text-emerald-600 dark:text-emerald-500'
                        }
                      >
                        · {s.price_pct > 0 ? '+' : ''}
                        {s.price_pct}% precio
                      </span>
                    )}
                    {s.pack_price_overrides && (
                      <span className="ml-1 font-semibold text-amber-600 dark:text-amber-500">
                        · precios especiales
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`cupo-${s.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Cupo
                  </Label>
                  <Input
                    id={`cupo-${s.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    defaultValue={s.max_capacity}
                    className="w-20"
                    disabled={isPending}
                    onBlur={(e) => guardarCupo(s, e.target.value)}
                  />
                  <Label
                    htmlFor={`pct-${s.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    %
                  </Label>
                  <Input
                    id={`pct-${s.id}`}
                    type="number"
                    inputMode="decimal"
                    step="1"
                    defaultValue={s.price_pct || ''}
                    placeholder="0"
                    className="w-16"
                    disabled={isPending}
                    onBlur={(e) => guardarPct(s, e.target.value)}
                    aria-label="Ajuste de precio %"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar salida"
                    onClick={() => borrar(s.id)}
                    disabled={isPending}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                {packsDisponibles.length > 0 && (
                  <details className="w-full basis-full">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Precios especiales por paquete
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {packsDisponibles.map((t) => (
                        <div key={t.key} className="space-y-1">
                          <Label
                            htmlFor={`ov-${s.id}-${t.key}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t.label}
                          </Label>
                          <Input
                            id={`ov-${s.id}-${t.key}`}
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            step="0.01"
                            defaultValue={s.pack_price_overrides?.[t.key] ?? ''}
                            placeholder="usa el %"
                            className="w-28"
                            disabled={isPending}
                            onBlur={(e) => guardarOverride(s, t.key, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="nueva-salida-fecha">Fecha de salida</Label>
            <Input
              id="nueva-salida-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nueva-salida-cupo">Cupo</Label>
            <Input
              id="nueva-salida-cupo"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className="sm:w-28"
              value={cupo}
              onChange={(e) => setCupo(e.target.value)}
              placeholder="Ej. 40"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nueva-salida-pct">Precio %</Label>
            <Input
              id="nueva-salida-pct"
              type="number"
              inputMode="decimal"
              step="1"
              className="sm:w-24"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="0"
              title="Ajuste de temporada: +25 = alta, -10 = promo"
            />
          </div>
          <Button type="button" onClick={agregar} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Agregar salida'}
          </Button>
        </div>

        {packsDisponibles.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Precios especiales por paquete para esta salida (opcional)
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {packsDisponibles.map((t) => (
                <div key={t.key} className="space-y-1">
                  <Label
                    htmlFor={`nueva-ov-${t.key}`}
                    className="text-xs text-muted-foreground"
                  >
                    {t.label}
                  </Label>
                  <Input
                    id={`nueva-ov-${t.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    value={overridesNueva[t.key] ?? ''}
                    placeholder="usa el %"
                    className="w-28"
                    onChange={(e) =>
                      setOverridesNueva((o) => ({ ...o, [t.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </details>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
