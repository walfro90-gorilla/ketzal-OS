'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, SendIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { ClawbotKind, ClawbotReminder } from './data'
import { descartarRecordatorio, marcarEnviado } from './acciones'

// Chip por tipo de recordatorio: vencido = destructive, por vencer = ámbar
// (misma convención que el badge "Cotización" de /ventas), viaje = primario
// (teal de marca), cotización = muted.
const KIND_CHIP: Record<
  ClawbotKind,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'
    className?: string
  }
> = {
  abono_vencido: { label: 'Abono vencido', variant: 'destructive' },
  abono_por_vencer: { label: 'Abono por vencer', variant: 'warning' },
  viaje_proximo: { label: 'Viaje próximo', variant: 'default' },
  cotizacion_seguimiento: { label: 'Cotización', variant: 'secondary' },
  // F7 — reglas operativas. saldo_sin_plan es cobranza (whatsapp al cliente);
  // los otros dos son internos al agente (sin teléfono, con "Ver venta").
  saldo_sin_plan: { label: 'Saldo por cobrar', variant: 'warning' },
  viaje_manana_operativo: { label: 'Viaje mañana', variant: 'default' },
  pago_sin_recibo: { label: 'Abono sin recibo', variant: 'secondary' },
}

// Recordatorios internos al agente (no se mandan por WhatsApp): en vez del
// botón de enviar, se ofrece un enlace directo a la venta.
const INTERNAL_KINDS = new Set<ClawbotKind>([
  'viaje_manana_operativo',
  'pago_sin_recibo',
])

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
  const isInternal = INTERNAL_KINDS.has(reminder.kind)

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
        {isInternal ? (
          // Recordatorio interno: la nota es de lectura (no se edita ni se
          // manda por WhatsApp); la acción es abrir la venta.
          <p className="text-sm text-muted-foreground">{reminder.message}</p>
        ) : (
          /* min-h-24: el mensaje de WhatsApp suele ser más largo que una nota. */
          <Textarea
            id={`clawbot-msg-${reminder.id}`}
            aria-label="Mensaje del recordatorio"
            className="min-h-24"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isPending}
          />
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isInternal ? (
            reminder.booking_id && (
              <Link
                href={`/ventas/${reminder.booking_id}`}
                className={buttonVariants()}
              >
                <ArrowRightIcon />
                Ver venta
              </Link>
            )
          ) : (
            <Button
              type="button"
              onClick={handleEnviar}
              disabled={!tel || isPending}
            >
              <SendIcon />
              {isPending ? 'Enviando…' : 'Enviar por WhatsApp'}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={handleDescartar}
            disabled={isPending}
          >
            <XIcon />
            Descartar
          </Button>
          {!isInternal && !tel && (
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
