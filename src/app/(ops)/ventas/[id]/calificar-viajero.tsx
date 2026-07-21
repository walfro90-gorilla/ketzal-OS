'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { StarIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { calificarViajero } from './actions'

// La agencia califica al viajero de un pedido de marketplace (reputación B2C,
// privada). Solo se muestra en ventas de marketplace ya completadas.
export function CalificarViajero({
  bookingId,
  yaCalificado,
}: {
  bookingId: string
  yaCalificado: boolean
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(yaCalificado)
  const [busy, setBusy] = useState(false)

  async function enviar() {
    if (rating < 1) {
      toast.error('Elige de 1 a 5 estrellas.')
      return
    }
    setBusy(true)
    const res = await calificarViajero(bookingId, rating, comment)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setDone(true)
    toast.success('Calificación guardada')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calificar al viajero</CardTitle>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-muted-foreground">
            Ya calificaste a este viajero.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                  className="p-0.5"
                >
                  <StarIcon
                    className={`size-7 ${n <= rating ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Notas sobre el viajero (opcional, privado)"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <Button type="button" disabled={busy} onClick={enviar}>
              Guardar calificación
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
