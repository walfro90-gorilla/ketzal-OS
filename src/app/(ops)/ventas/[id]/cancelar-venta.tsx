'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  cancelarVentaV2,
  previewCancelacion,
  type PreviewCancelacion,
} from './cancelacion-actions'

/**
 * Cancelación con política (C4/b050): al abrir carga el preview (pena del
 * tramo, pagado) y ofrece las DOS salidas — crédito 100% (recomendada, sin
 * pena) o efectivo (retiene la pena; devolver es acto aparte en abonos).
 * "Condonar pena" = cancelación imputable a la agencia / fuerza mayor
 * (motivo obligatorio). Reemplaza el flujo viejo status+motivo.
 */

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const fechaLarga = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

export function CancelarVenta({ bookingId }: { bookingId: string }) {
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<PreviewCancelacion | null>(null)
  const [mode, setMode] = useState<'credito' | 'efectivo'>('credito')
  const [waive, setWaive] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function abrir() {
    setError(null)
    startTransition(async () => {
      const res = await previewCancelacion(bookingId)
      if ('error' in res) return void setError(res.error)
      setPreview(res.preview)
      // Sin dinero abonado no hay crédito que emitir: default a efectivo.
      if (Number(res.preview.pagado_mxn) <= 0) setMode('efectivo')
    })
  }

  function confirmar() {
    if (mode === 'efectivo' && waive && !reason.trim()) {
      setError('Condonar la pena requiere motivo.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await cancelarVentaV2(
        bookingId,
        reason,
        mode,
        mode === 'efectivo' && waive,
      )
      if ('error' in res) return void setError(res.error)
      // revalidatePath refresca la página: la venta pasa a "Cancelada".
      if (res.creditoMxn != null) {
        toast.success(`Venta cancelada. Crédito emitido: ${mxn.format(res.creditoMxn)}.`)
      } else if (res.aDevolverMxn > 0) {
        toast.success(
          `Venta cancelada. Pena retenida ${mxn.format(res.penaMxn)} · por devolver ${mxn.format(res.aDevolverMxn)} (usa Devolver/Parcial en abonos).`,
        )
      } else {
        toast.success('Venta cancelada.')
      }
      setPreview(null)
    })
  }

  if (!preview) {
    return (
      <div className="space-y-2">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={abrir}
          loading={isPending}
        >
          Cancelar venta
        </Button>
      </div>
    )
  }

  const pagado = Number(preview.pagado_mxn)
  const pena = Number(preview.pena_mxn ?? 0)
  const aDevolver = Number(preview.efectivo?.a_devolver_mxn ?? 0)
  const credito = preview.credito

  return (
    <div className="space-y-4 rounded-lg border border-destructive/40 p-4">
      <div className="text-sm">
        {preview.sin_fecha ? (
          <p className="text-muted-foreground">
            Venta sin fecha de viaje: no aplica pena por plazo.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Faltan{' '}
            <span className="font-medium text-foreground">{preview.dias_antes}</span>{' '}
            días para el viaje · tramo {preview.tramo_pct}% · pagado{' '}
            <span className="font-medium text-foreground">{mxn.format(pagado)}</span>
            {!preview.aceptada && (
              <span className="ml-1 text-amber-600 dark:text-amber-500">
                · ⚠️ política sin aceptación registrada
              </span>
            )}
          </p>
        )}
      </div>

      {/* Las dos salidas, crédito primero (retiene caja, sin pena). */}
      <div className="space-y-2">
        {pagado > 0 && credito && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="radio"
              name="modo-cancelacion"
              checked={mode === 'credito'}
              onChange={() => setMode('credito')}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="font-medium">
                Crédito {mxn.format(Number(credito.monto_mxn))} (recomendado)
              </span>
              <span className="block text-muted-foreground">
                Sin pena. Válido en cualquier viaje de Ketzal hasta el{' '}
                {fechaLarga.format(new Date(`${credito.expira}T00:00:00`))}.
              </span>
            </span>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="radio"
            name="modo-cancelacion"
            checked={mode === 'efectivo'}
            onChange={() => setMode('efectivo')}
            className="mt-0.5 accent-primary"
          />
          <span>
            <span className="font-medium">Efectivo</span>
            <span className="block text-muted-foreground">
              {waive
                ? `Pena condonada · por devolver ${mxn.format(pagado)}.`
                : `Retiene ${mxn.format(pena)} de pena · por devolver ${mxn.format(aDevolver)}.`}{' '}
              La devolución se registra aparte en abonos.
            </span>
          </span>
        </label>
        {mode === 'efectivo' && (
          <label className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={waive}
              onChange={(e) => setWaive(e.target.checked)}
              className="size-4 accent-primary"
            />
            Condonar pena (cancelación de la agencia / fuerza mayor — motivo
            obligatorio)
          </label>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cancelar-motivo">
          Motivo {mode === 'efectivo' && waive ? '(obligatorio)' : '(opcional)'}
        </Label>
        <Textarea
          id="cancelar-motivo"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. el cliente ya no puede viajar"
          disabled={isPending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={confirmar}
          loading={isPending}
        >
          {isPending ? 'Cancelando…' : 'Confirmar cancelación'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreview(null)}
          disabled={isPending}
        >
          Volver
        </Button>
      </div>
    </div>
  )
}
