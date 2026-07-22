'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { TicketIcon, ExternalLinkIcon, CopyIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { emitirVoucher } from './voucher-actions'

// Emite (o abre) el voucher de servicio de la venta. Se emite una sola vez
// (idempotente); una vez emitido, se abre o se copia el link público.
export function VoucherBoton({
  bookingId,
  initialVoucherId,
}: {
  bookingId: string
  initialVoucherId: string | null
}) {
  const [voucherId, setVoucherId] = useState<string | null>(initialVoucherId)
  const [isPending, startTransition] = useTransition()

  function onEmit() {
    startTransition(async () => {
      const res = await emitirVoucher(bookingId)
      if ('error' in res) toast.error(res.error)
      else {
        setVoucherId(res.id)
        toast.success('Voucher emitido')
      }
    })
  }

  function onCopy() {
    if (!voucherId) return
    const url = `${window.location.origin}/voucher/${voucherId}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link del voucher copiado'),
      () => toast.error('No se pudo copiar el link')
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher de servicio</CardTitle>
        <CardDescription>
          Comprobante para presentar al operador/hotel (acredita el servicio, sin
          montos). Se comparte por link público.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {voucherId ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/voucher/${voucherId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'default' })}
            >
              <ExternalLinkIcon className="size-4" />
              Ver voucher
            </a>
            <Button type="button" variant="outline" onClick={onCopy}>
              <CopyIcon className="size-4" />
              Copiar link
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={onEmit} disabled={isPending}>
            <TicketIcon className="size-4" />
            {isPending ? 'Emitiendo…' : 'Emitir voucher'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
