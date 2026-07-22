'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { TicketIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { emitMiVoucher } from './voucher-actions'

// Voucher del viaje: si ya existe lo abre; si no, el viajero lo genera (idempotente)
// y salta a la página pública imprimible /voucher/[id].
export function VoucherViajero({
  bookingId,
  voucherId,
}: {
  bookingId: string
  voucherId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (voucherId) {
    return (
      <Link
        href={`/voucher/${voucherId}`}
        className={buttonVariants({ variant: 'outline', size: 'touch' })}
      >
        <TicketIcon className="mr-1 size-4" /> Ver voucher
      </Link>
    )
  }

  async function generar() {
    setBusy(true)
    const res = await emitMiVoucher(bookingId)
    if ('error' in res) {
      toast.error(res.error)
      setBusy(false)
      return
    }
    router.push(`/voucher/${res.id}`)
  }

  return (
    <Button type="button" variant="outline" size="touch" onClick={generar} disabled={busy}>
      <TicketIcon className="mr-1 size-4" /> {busy ? 'Generando…' : 'Generar voucher'}
    </Button>
  )
}
