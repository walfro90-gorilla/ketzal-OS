'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { HourglassIcon, LandmarkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  crearLinkPagoMarketplace,
  previewPlan,
  generarPlanMarketplace,
  obtenerSpeiPedido,
  type PlanPreview,
  type SpeiInfo,
} from '../actions'
import { WaButton } from './wa-button'
import { SpeiPanel } from './spei-panel'
import { MpPaymentBrick, type ResultadoBrick } from './mp-payment-brick'

// Opciones de pago del pedido (B.2): contado (pago total) o plan (enganche 20% +
// abonos), por Mercado Pago o por transferencia SPEI directa a la agencia (b034,
// solo si tiene CLABE). En plan, el enganche se paga ahora; los abonos siguientes
// se pagan desde "Mis compras" (B.3).

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
  const router = useRouter()
  const [modo, setModo] = useState<'contado' | 'plan'>('contado')
  const [freq, setFreq] = useState('quincenal')
  const [finalDate, setFinalDate] = useState('')
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [busy, setBusy] = useState(false)
  // Monto que se le pasó al Payment Brick embebido; null = aún no se mostró.
  const [brickAmount, setBrickAmount] = useState<number | null>(null)
  // lazy init: Date.now() no puede correr en render (regla de pureza)
  const [manana] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))

  // SPEI (b034): datos bancarios de la agencia (null ⇒ no acepta transferencia).
  const [spei, setSpei] = useState<SpeiInfo | null>(null)
  const [speiOpen, setSpeiOpen] = useState(false)
  const [speiAmount, setSpeiAmount] = useState(total)
  const [speiEnviado, setSpeiEnviado] = useState<number | null>(null)
  useEffect(() => {
    obtenerSpeiPedido(bookingId).then((r) => setSpei(r.spei))
  }, [bookingId])

  // La salida manda la fecha límite; si no hay, la que elige el comprador.
  const finalEfectiva = travelDate ?? finalDate

  // Respaldo: checkout de Mercado Pago por redirect (Checkout Pro). Sigue vivo
  // por si el Brick falla o el banco exige un 3DS que no resuelve bien.
  async function pagarFallback(amount?: number) {
    setBusy(true)
    const res = await crearLinkPagoMarketplace(bookingId, serviceId, amount)
    if ('error' in res) {
      toast.error(res.error)
      setBusy(false)
      return
    }
    window.location.href = res.url // redirige a Mercado Pago
  }

  function manejarResultadoBrick(r: ResultadoBrick) {
    if (r.approved) {
      toast.success('¡Pago aprobado!')
      router.push('/mis-compras')
      return
    }
    if (r.status === 'pending' || r.status === 'in_process') {
      toast.message('Tu pago está en revisión. Te avisaremos cuando se confirme.')
      return
    }
    toast.error('El pago no se completó. Intenta con otra tarjeta o usa el checkout de Mercado Pago.')
    setBrickAmount(null)
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
    setBusy(false)
    if ('error' in gen) {
      toast.error(gen.error)
      return
    }
    setBrickAmount(gen.plan.enganche) // muestra el Brick con el monto del enganche
  }

  // Enganche por SPEI: genera el plan y abre el panel con el monto del enganche.
  async function speiEnganche() {
    if (!preview) return
    setBusy(true)
    const gen = await generarPlanMarketplace(bookingId, freq, travelDate ? null : finalDate)
    setBusy(false)
    if ('error' in gen) {
      toast.error(gen.error)
      return
    }
    setSpeiAmount(gen.plan.enganche)
    setSpeiOpen(true)
  }

  // Transferencia declarada: queda en revisión; los botones de pago se ocultan
  // para no duplicar el cobro (mismo criterio que la card de mis-compras).
  if (speiEnviado != null) {
    return (
      <div className="mt-6 space-y-4">
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-500">
          <HourglassIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Transferencia de {mxn.format(speiEnviado)} en revisión. La agencia
            la confirmará al recibirla.
          </span>
        </p>
        <Link
          href="/mis-compras"
          className="block text-center text-sm text-primary underline-offset-2 hover:underline"
        >
          Ver mi pedido en Mis compras →
        </Link>
        <WaButton phone={agencyPhone} text={waText} />
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={modo === 'contado' ? 'default' : 'outline'}
          onClick={() => {
            setModo('contado')
            setSpeiOpen(false)
          }}
        >
          Pago total
        </Button>
        <Button
          type="button"
          variant={modo === 'plan' ? 'default' : 'outline'}
          onClick={() => {
            setModo('plan')
            setSpeiOpen(false)
          }}
        >
          En abonos
        </Button>
      </div>

      {modo === 'contado' ? (
        <div className="space-y-2">
          {brickAmount == null ? (
            <Button
              type="button"
              size="touch"
              className="w-full"
              onClick={() => setBrickAmount(total)}
            >
              Pagar en línea {mxn.format(total)}
            </Button>
          ) : (
            <div className="space-y-2">
              <MpPaymentBrick
                bookingId={bookingId}
                amount={brickAmount}
                onResult={manejarResultadoBrick}
              />
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => pagarFallback()}
              >
                ¿Problemas para pagar? Usa el checkout de Mercado Pago
              </button>
            </div>
          )}
          {spei && !speiOpen && brickAmount == null && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setSpeiAmount(total)
                setSpeiOpen(true)
              }}
            >
              <LandmarkIcon /> Pagar por transferencia (SPEI)
            </Button>
          )}
        </div>
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
              loading={busy}
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
              {brickAmount == null ? (
                <Button
                  type="button"
                  size="touch"
                  className="w-full"
                  loading={busy}
                  onClick={pagarEnganche}
                >
                  {busy ? 'Calculando…' : `Pagar enganche ${mxn.format(preview.enganche)}`}
                </Button>
              ) : (
                <div className="space-y-2">
                  <MpPaymentBrick
                    bookingId={bookingId}
                    amount={brickAmount}
                    onResult={manejarResultadoBrick}
                  />
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => pagarFallback(brickAmount)}
                  >
                    ¿Problemas para pagar? Usa el checkout de Mercado Pago
                  </button>
                </div>
              )}
              {spei && !speiOpen && brickAmount == null && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={speiEnganche}
                >
                  <LandmarkIcon /> Enganche por transferencia (SPEI)
                </Button>
              )}
              <p className="text-center text-xs text-muted-foreground">
                Los abonos siguientes los pagas desde “Mis compras”.
              </p>
            </div>
          )}
        </div>
      )}

      {speiOpen && spei && (
        <SpeiPanel
          bookingId={bookingId}
          spei={spei}
          amount={speiAmount}
          onDone={() => {
            setSpeiOpen(false)
            setSpeiEnviado(speiAmount)
          }}
          onCancel={() => setSpeiOpen(false)}
        />
      )}

      <WaButton phone={agencyPhone} text={waText} />
    </div>
  )
}
