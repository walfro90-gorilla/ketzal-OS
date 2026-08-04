'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enviarPagoSpei, type SpeiInfo } from '../actions'
import { subirComprobanteSpei } from './subir-comprobante'

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
  // Comprobante obligatorio (b035): captura/imagen del pago. Sube al declarar.
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function copiar(texto: string, etiqueta: string) {
    await navigator.clipboard.writeText(texto)
    toast.success(`${etiqueta} copiada`)
  }

  /** Agrupa dígitos de 4 en 4 para lectura (la copia va sin espacios). */
  const grupos = (d: string) => d.replace(/(.{4})/g, '$1 ').trim()

  async function enviar() {
    if (!file) {
      toast.error('Adjunta el comprobante de tu transferencia (captura del pago).')
      return
    }
    setBusy(true)
    const up = await subirComprobanteSpei(bookingId, file)
    if ('error' in up) {
      toast.error(up.error)
      setBusy(false)
      return
    }
    const res = await enviarPagoSpei({
      bookingId,
      amount,
      reference: ref,
      receiptUrl: up.url,
    })
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
        <p className="text-xs font-medium">Transferencia (CLABE)</p>
        <p className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] tabular-nums">
            {grupos(spei.clabe)}
          </span>
          <button
            type="button"
            onClick={() => copiar(spei.clabe, 'CLABE')}
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

      {/* Depósito en EFECTIVO en cajero BBVA (b038): a la tarjeta de débito. */}
      {spei.tarjeta && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2.5">
          <p className="text-xs font-medium">
            Depósito en efectivo (cajero BBVA)
          </p>
          <p className="flex items-center justify-between gap-2">
            <span className="font-mono text-[13px] tabular-nums">
              {grupos(spei.tarjeta)}
            </span>
            <button
              type="button"
              onClick={() => copiar(spei.tarjeta!, 'Tarjeta')}
              aria-label="Copiar tarjeta"
              className="text-muted-foreground hover:text-foreground"
            >
              <CopyIcon className="size-4" />
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            Tarjeta de débito{spei.cuenta ? ` · Cuenta ${grupos(spei.cuenta)}` : ''}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">
              ¿Cómo depositar en un cajero BBVA?
            </summary>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                Ubica un cajero BBVA que reciba depósitos en efectivo
                (Practicaja o cajero inteligente).
              </li>
              <li>
                En la pantalla elige <b>Depósitos</b> → <b>Depósito a cuenta o
                tarjeta</b> (no necesitas insertar ninguna tarjeta tuya).
              </li>
              <li>
                Teclea el número de tarjeta de arriba y verifica que el titular
                sea {spei.titular ?? 'el de la agencia'}.
              </li>
              <li>Inserta los billetes; el cajero los cuenta y te confirma el monto.</li>
              <li>
                Toma tu ticket y súbele foto aquí como comprobante.
              </li>
            </ol>
          </details>
        </div>
      )}
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Clave de rastreo o referencia (opcional)"
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
      />
      {/* Comprobante obligatorio (b035). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      {file ? (
        <p className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <span className="truncate">
            <PaperclipIcon className="mr-1 inline size-3.5" />
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Quitar comprobante"
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <PaperclipIcon /> Adjuntar comprobante (obligatorio)
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="button" loading={busy} disabled={!file} onClick={enviar}>
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
