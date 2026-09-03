'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { desconectarMp } from './mp-actions'

// Desconectar = Ketzal borra su copia de los tokens (`mp_accounts`) y deja de
// cobrar a esa cuenta. NO revoca el permiso del lado de Mercado Pago: eso vive
// en la cuenta del vendedor (ADR-0024), y el texto lo dice para no insinuar lo
// contrario. Confirmación en dos pasos dentro de la página, como EliminarProveedor.
export function DesconectarMp({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function desconectar() {
    setError(null)
    startTransition(async () => {
      const r = await desconectarMp(supplierId)
      if ('error' in r) {
        setError(r.error)
        setConfirming(false)
        return
      }
      // El éxito se ve: la tarjeta vuelve a "Conectar mi Mercado Pago".
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            Ketzal dejará de cobrar a esta cuenta: las ventas en línea de la
            agencia vuelven al depósito a 7 días. Esto <strong>no</strong> le
            quita el permiso a Ketzal en Mercado Pago — eso se hace en la cuenta
            de MP, en <em>Aplicaciones autorizadas</em>.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={desconectar}
              disabled={isPending}
            >
              {isPending ? 'Desconectando…' : 'Sí, desconectar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm font-medium text-destructive underline underline-offset-4 hover:opacity-80"
        >
          Desconectar
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
