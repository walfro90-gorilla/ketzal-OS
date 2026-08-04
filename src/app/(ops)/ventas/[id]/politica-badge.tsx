'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { registrarAceptacionAgente } from './politica-actions'

// C2 — Estado de la política de cancelación en el detalle de la venta:
// aceptada (fecha + canal) o pendiente, con acción para registrar una
// aceptación hecha por WhatsApp/verbal (canal 'agente').

const fecha = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const CANAL_LABEL: Record<string, string> = {
  checkout: 'compra en línea',
  cotizacion: 'cotización',
  agente: 'registrada por el agente',
}

export function PoliticaBadge({
  bookingId,
  acceptedAt,
  canal,
  tieneSnapshot,
  cancelada,
}: {
  bookingId: string
  acceptedAt: string | null
  canal: string | null
  tieneSnapshot: boolean
  cancelada: boolean
}) {
  const [pending, start] = useTransition()

  if (acceptedAt) {
    return (
      <p className="text-sm font-medium text-primary">
        ✓ Aceptada el {fecha.format(new Date(acceptedAt))}
        {canal ? (
          <span className="font-normal text-muted-foreground">
            {' '}
            · vía {CANAL_LABEL[canal] ?? canal}
          </span>
        ) : null}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-amber-600 dark:text-amber-500">
        ⚠️ Sin aceptación registrada
        {!tieneSnapshot && ' · sin política pactada (venta previa a b047)'}
      </p>
      {!cancelada && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await registrarAceptacionAgente(bookingId)
              if ('error' in res) return void toast.error(res.error)
              toast.success('Aceptación registrada (canal agente).')
            })
          }
        >
          Registrar aceptación (WhatsApp/verbal)
        </Button>
      )}
    </div>
  )
}
