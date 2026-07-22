'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { mxn } from '@/components/data/format'
import { reembolsarMercadoPago } from './actions'

// Devolución real por Mercado Pago (regresa el dinero a la tarjeta del comprador).
// Solo se muestra en ventas con pago MP y sin reembolso previo.
export function ReembolsarMP({
  bookingId,
  monto,
}: {
  bookingId: string
  monto: number
}) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function devolver() {
    const ok = window.confirm(
      `¿Devolver ${mxn.format(monto)} al comprador por Mercado Pago? ` +
        'El dinero regresa a su tarjeta. Esta acción no se puede deshacer.'
    )
    if (!ok) return
    setBusy(true)
    const res = await reembolsarMercadoPago(bookingId)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(`Devuelto ${mxn.format(res.refunded)} por Mercado Pago`)
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={busy}
      onClick={devolver}
    >
      {busy ? 'Devolviendo…' : `Devolver ${mxn.format(monto)} por Mercado Pago`}
    </Button>
  )
}
