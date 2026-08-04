'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usarMiCredito } from './credito-actions'

// C5 (b051) — El TITULAR aplica su crédito a su propio pedido, en cualquier
// agencia de Ketzal (el crédito es universal). Vive aquí y no en el panel del
// agente porque tras el blindaje de seguridad solo el titular (o la agencia
// emisora) puede canjear: una agencia ajena ya no consume crédito que no emitió.

export type CreditoViajero = {
  id: string
  agencia: string
  saldo_mxn: number
  expira: string
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function UsarCredito({
  bookingId,
  saldoPedido,
  creditos,
}: {
  bookingId: string
  saldoPedido: number
  creditos: CreditoViajero[]
}) {
  const [pending, start] = useTransition()
  const credito = creditos.find((c) => Number(c.saldo_mxn) > 0)
  if (!credito || saldoPedido <= 0) return null

  const max = Math.min(Number(credito.saldo_mxn), saldoPedido)

  return (
    <Button
      type="button"
      variant="outline"
      size="touch"
      className="w-full"
      loading={pending}
      onClick={() => {
        const raw = window.prompt(
          `¿Cuánto de tu crédito quieres aplicar? (máximo ${mxn.format(max)})`,
          String(max)
        )
        if (raw == null) return
        const m = Number(raw)
        if (!Number.isFinite(m) || m <= 0) {
          toast.error('Escribe un monto mayor que 0.')
          return
        }
        if (m > max) {
          toast.error(`Máximo aplicable: ${mxn.format(max)}.`)
          return
        }
        start(async () => {
          const res = await usarMiCredito(bookingId, credito.id, m)
          if ('error' in res) return void toast.error(res.error)
          toast.success(
            `Aplicaste ${mxn.format(m)} de tu crédito. Te quedan ${mxn.format(res.saldoCredito)}.`
          )
        })
      }}
    >
      Usar mi crédito ({mxn.format(Number(credito.saldo_mxn))})
    </Button>
  )
}
