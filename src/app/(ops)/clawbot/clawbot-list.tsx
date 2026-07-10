'use client'

import { useState, useTransition } from 'react'
import { SendIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ClawbotKind, ClawbotReminder } from './data'
import { descartarRecordatorio, marcarEnviado } from './acciones'

// Chip por tipo de recordatorio: vencido = destructive, por vencer = ámbar
// (misma convención que el badge "Cotización" de /ventas), viaje = primario
// (teal de marca), cotización = muted.
const KIND_CHIP: Record<
  ClawbotKind,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    className?: string
  }
> = {
  abono_vencido: { label: 'Abono vencido', variant: 'destructive' },
  abono_por_vencer: {
    label: 'Abono por vencer',
    variant: 'outline',
    className:
      'border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  viaje_proximo: { label: 'Viaje próximo', variant: 'default' },
  cotizacion_seguimiento: { label: 'Cotización', variant: 'secondary' },
}

// Estilo de <textarea> nativo alineado al Input de shadcn (no hay Textarea
// en components/ui); mismo patrón que clientes/cliente-form.tsx, con
// `text-base` en móvil para evitar el auto-zoom de iOS al enfocar.
const textareaClass =
  'min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1.5 text-base md:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

/**
 * Normaliza el teléfono para wa.me: solo dígitos, y si son 10 (número local
 * mexicano) se antepone la lada de país 52. Devuelve null si no hay número.
 */
function waPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 10 ? `52${digits}` : digits
}

function ReminderCard({ reminder }: { reminder: ClawbotReminder }) {
  const [message, setMessage] = useState(reminder.message)
  const [isPending, startTransition] = useTransition()

  const chip = KIND_CHIP[reminder.kind] ?? {
    label: reminder.kind,
    variant: 'outline' as const,
  }
  const tel = waPhone(reminder.phone)

  function handleEnviar() {
    if (!tel) return
    // Abrir WhatsApp primero (dentro del click, para no toparse con el
    // bloqueador de pop-ups) y luego marcar como enviado; la revalidación
    // saca la tarjeta de la bandeja.
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    startTransition(async () => {
      const result = await marcarEnviado(reminder.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Recordatorio enviado')
      }
    })
  }

  function handleDescartar() {
    startTransition(async () => {
      const result = await descartarRecordatorio(reminder.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Recordatorio descartado')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {reminder.cliente ?? 'Sin cliente'}
        </CardTitle>
        {reminder.servicio && (
          <CardDescription>{reminder.servicio}</CardDescription>
        )}
        <CardAction>
          <Badge variant={chip.variant} className={chip.className}>
            {chip.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          id={`clawbot-msg-${reminder.id}`}
          aria-label="Mensaje del recordatorio"
          className={textareaClass}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={handleEnviar}
            disabled={!tel || isPending}
          >
            <SendIcon />
            {isPending ? 'Enviando…' : 'Enviar por WhatsApp'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleDescartar}
            disabled={isPending}
          >
            <XIcon />
            Descartar
          </Button>
          {!tel && (
            <p className="text-xs text-muted-foreground sm:ml-auto">
              Sin teléfono
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ClawbotList({ reminders }: { reminders: ClawbotReminder[] }) {
  // La bandeja ya llega ordenada por urgencia (vencido → por vencer → viaje
  // → cotización); el chip identifica el tipo sin necesidad de secciones.
  return (
    <div className="space-y-4">
      {reminders.map((r) => (
        <ReminderCard key={r.id} reminder={r} />
      ))}
    </div>
  )
}
