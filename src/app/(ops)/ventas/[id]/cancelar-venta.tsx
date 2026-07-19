'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cancelarVenta } from './actions'

/**
 * Cancelación con confirmación en dos pasos dentro de la página
 * (sin confirm() del navegador), mismo patrón que EliminarProveedor.
 */
export function CancelarVenta({ bookingId }: { bookingId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      // En éxito revalidatePath refresca la página: la venta pasa a
      // "Cancelada" y esta zona de peligro desaparece.
      const result = await cancelarVenta(bookingId, reason.trim())
      if ('error' in result) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="space-y-3">
      {confirming ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cancelar-motivo">Motivo (opcional)</Label>
            <Textarea
              id="cancelar-motivo"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. el cliente ya no puede viajar"
              disabled={isPending}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">¿Seguro?</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? 'Cancelando…' : 'Sí, cancelar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          Cancelar venta
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
