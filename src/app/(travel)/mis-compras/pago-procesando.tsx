'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Tras volver de Mercado Pago, el pago se confirma por webhook (async, segundos).
// Este banner refresca el server component unas veces para captar el momento en
// que el pedido pasa a "pagado" sin que el comprador tenga que recargar a mano.
export function PagoProcesando() {
  const router = useRouter()
  const [intentos, setIntentos] = useState(0)

  useEffect(() => {
    if (intentos >= 6) return // ~18s de reintentos, luego se detiene
    const t = setTimeout(() => {
      router.refresh()
      setIntentos((i) => i + 1)
    }, 3000)
    return () => clearTimeout(t)
  }, [intentos, router])

  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
      <p>
        <strong>Estamos validando tu pago con Mercado Pago…</strong> Tu compra se
        marcará como pagada en unos segundos. No cierres esta página.
      </p>
    </div>
  )
}
