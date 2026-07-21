'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  crearLinkPagoMarketplace,
  previewPlan,
  generarPlanMarketplace,
  type PlanPreview,
} from '../actions'
import { WaButton } from './wa-button'

// Opciones de pago del pedido (B.2): contado (pago total) o plan (enganche 20% +
// abonos). Ambos redirigen a Mercado Pago. En plan, el enganche se paga ahora; los
// abonos siguientes se pagan desde "Mis compras" (B.3).

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const FRECUENCIAS = [
  { v: 'semanal', l: 'Semanal' },
  { v: 'quincenal', l: 'Quincenal' },
  { v: 'mensual', l: 'Mensual' },
]

export function PagoBloque({
  bookingId,
  serviceId,
  total,
  travelDate,
  waText,
  agencyPhone,
}: {
  bookingId: string
  serviceId: string
  total: number
  /** Fecha de salida del pedido (si el viaje se vende por cupo), o null. */
  travelDate: string | null
  waText: string
  agencyPhone: string | null
}) {
  const [modo, setModo] = useState<'contado' | 'plan'>('contado')
  const [freq, setFreq] = useState('quincenal')
  const [finalDate, setFinalDate] = useState('')
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [busy, setBusy] = useState(false)
  // lazy init: Date.now() no puede correr en render (regla de pureza)
  const [manana] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))

  // La salida manda la fecha límite; si no hay, la que elige el comprador.
  const finalEfectiva = travelDate ?? finalDate

  async function pagar(amount?: number) {
    setBusy(true)
    const res = await crearLinkPagoMarketplace(bookingId, serviceId, amount)
    if ('error' in res) {
      toast.error(res.error)
      setBusy(false)
      return
    }
    window.location.href = res.url // redirige a Mercado Pago
  }

  async function calcular() {
    if (!finalEfectiva) {
      toast.error('Elige una fecha límite.')
      return
    }
    setBusy(true)
    const res = await previewPlan(total, finalEfectiva, freq)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setPreview(res.plan)
  }

  async function pagarEnganche() {
    if (!preview) return
    setBusy(true)
    const gen = await generarPlanMarketplace(bookingId, freq, travelDate ? null : finalDate)
    if ('error' in gen) {
      toast.error(gen.error)
      setBusy(false)
      return
    }
    await pagar(gen.plan.enganche) // deja busy=true; redirige a MP
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={modo === 'contado' ? 'default' : 'outline'}
          onClick={() => setModo('contado')}
        >
          Pago total
        </Button>
        <Button
          type="button"
          variant={modo === 'plan' ? 'default' : 'outline'}
          onClick={() => setModo('plan')}
        >
          En abonos
        </Button>
      </div>

      {modo === 'contado' ? (
        <Button
          type="button"
          size="touch"
          className="w-full"
          disabled={busy}
          onClick={() => pagar()}
        >
          {busy ? 'Abriendo pago…' : `Pagar en línea ${mxn.format(total)}`}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="freq" className="text-sm font-medium">
              Frecuencia de abonos
            </label>
            <NativeSelect
              id="freq"
              value={freq}
              onChange={(e) => {
                setFreq(e.target.value)
                setPreview(null)
              }}
            >
              {FRECUENCIAS.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.l}
                </option>
              ))}
            </NativeSelect>
          </div>

          {!travelDate && (
            <div className="space-y-2">
              <label htmlFor="fecha" className="text-sm font-medium">
                Fecha límite de pago
              </label>
              <Input
                id="fecha"
                type="date"
                min={manana}
                value={finalDate}
                onChange={(e) => {
                  setFinalDate(e.target.value)
                  setPreview(null)
                }}
              />
            </div>
          )}

          {!preview ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={calcular}
            >
              {busy ? 'Calculando…' : 'Ver plan'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p>
                  Enganche hoy:{' '}
                  <span className="font-semibold tabular-nums">
                    {mxn.format(preview.enganche)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Luego {preview.num_abonos}{' '}
                  {preview.num_abonos === 1 ? 'abono' : 'abonos'} de{' '}
                  {mxn.format(preview.monto_abono)}
                </p>
              </div>
              <Button
                type="button"
                size="touch"
                className="w-full"
                disabled={busy}
                onClick={pagarEnganche}
              >
                {busy ? 'Abriendo pago…' : `Pagar enganche ${mxn.format(preview.enganche)}`}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Los abonos siguientes los pagas desde “Mis compras”.
              </p>
            </div>
          )}
        </div>
      )}

      <WaButton phone={agencyPhone} text={waText} />
    </div>
  )
}
