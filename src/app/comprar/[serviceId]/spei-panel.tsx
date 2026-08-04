'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enviarPagoSpei, type SpeiInfo } from '../actions'

// Panel de pago por transferencia SPEI (b034), compartido entre el flujo de
// compra (/comprar, post-pedido) y la card del pedido en /mis-compras. Muestra
// los datos bancarios de la agencia + monto exacto y registra la declaración
// "ya transferí" (queda en revisión del admin). `children` va entre el título
// y los datos (p.ej. el selector abono/liquidar de mis-compras).

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function SpeiPanel({
  bookingId,
  spei,
  amount,
  onDone,
  onCancel,
  children,
}: {
  bookingId: string
  spei: SpeiInfo
  amount: number
  /** Se llama tras registrar la transferencia con éxito. */
  onDone: () => void
  onCancel: () => void
  children?: React.ReactNode
}) {
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(spei.clabe)
    toast.success('CLABE copiada')
  }

  async function enviar() {
    setBusy(true)
    const res = await enviarPagoSpei({ bookingId, amount, reference: ref })
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Transferencia registrada. La agencia la confirmará al recibirla.')
    onDone()
  }

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <p className="font-medium">Transferencia SPEI a {spei.agencia}</p>
      {children}
      <div className="space-y-1 rounded-md bg-muted/50 p-2.5">
        <p className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] tabular-nums">{spei.clabe}</span>
          <button
            type="button"
            onClick={copiar}
            aria-label="Copiar CLABE"
            className="text-muted-foreground hover:text-foreground"
          >
            <CopyIcon className="size-4" />
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          {[spei.banco, spei.titular].filter(Boolean).join(' · ') ||
            'CLABE de la agencia'}
        </p>
        <p className="text-xs text-muted-foreground">
          Monto exacto:{' '}
          <span className="font-semibold text-foreground">{mxn.format(amount)}</span>
        </p>
      </div>
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Clave de rastreo o referencia (opcional)"
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      <div className="flex gap-2">
        <Button type="button" loading={busy} onClick={enviar}>
          Ya hice la transferencia
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tu pago quedará en revisión y la agencia lo confirmará al ver la
        transferencia en su cuenta.
      </p>
    </div>
  )
}
