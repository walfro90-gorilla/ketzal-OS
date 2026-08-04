'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { aceptarPoliticaCotizacion } from './politica-actions'

// C2 — Botón de aceptación de la política en la cotización pública. Una sola
// vez: aceptada ⇒ solo se muestra la fecha (la aceptación es evidencia, no se
// puede des-aceptar). El botón no sale en la impresión (print:hidden).

const fecha = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
})

export function AceptarPolitica({
  token,
  initialAcceptedAt,
}: {
  token: string
  initialAcceptedAt: string | null
}) {
  const [acceptedAt, setAcceptedAt] = useState(initialAcceptedAt)
  const [pending, start] = useTransition()

  if (acceptedAt) {
    return (
      <p className="text-sm font-medium text-primary">
        ✓ Política aceptada el {fecha.format(new Date(acceptedAt))}
      </p>
    )
  }

  return (
    <div className="space-y-2 print:hidden">
      <Button
        type="button"
        size="touch"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await aceptarPoliticaCotizacion(token)
            if ('error' in res) return void toast.error(res.error)
            setAcceptedAt(res.acceptedAt ?? new Date().toISOString())
            toast.success('Aceptaste la política de cancelación.')
          })
        }
      >
        Acepto la política de cancelación
      </Button>
      <p className="text-xs text-muted-foreground">
        Al aceptar quedas de acuerdo con estas condiciones para este viaje.
      </p>
    </div>
  )
}
