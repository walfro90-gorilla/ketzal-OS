'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { pagarConBrickMarketplace } from '../actions'

// Fase 1 (checkout embebido): Payment Brick de Mercado Pago cargado con el
// script vanilla (sin @mercadopago/sdk-react — evita fricción de peer-deps
// con Next 16/React 19; mismo espíritu que el MCP evitando @supabase/supabase-js).
// El comprador nunca sale de Ketzal OS: el onSubmit del Brick manda su
// formData al server action, que llama a Mercado Pago server-side.

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      opts?: { locale?: string }
    ) => {
      bricks: () => {
        create: (
          type: string,
          containerId: string,
          settings: Record<string, unknown>
        ) => Promise<{ unmount: () => void }>
      }
    }
  }
}

let sdkPromise: Promise<void> | null = null

function cargarSdkMp(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  sdkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://sdk.mercadopago.com/js/v2'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Mercado Pago.'))
    document.head.appendChild(s)
  })
  return sdkPromise
}

export type ResultadoBrick = { approved: boolean; status: string; statusDetail?: string }

export function MpPaymentBrick({
  bookingId,
  amount,
  onResult,
}: {
  bookingId: string
  amount: number
  onResult: (r: ResultadoBrick) => void
}) {
  const containerId = `mp-brick-${bookingId}`
  const brickRef = useRef<{ unmount: () => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let cancelado = false

    async function montar() {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc(
        'get_booking_checkout_key' as never,
        { p_booking_id: bookingId } as never
      )
      if (cancelado) return
      if (rpcError || !data) {
        setError('No se pudo iniciar el pago.')
        return
      }
      const info = data as unknown as { public_key: string | null }
      const publicKey = info.public_key ?? process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
      if (!publicKey) {
        setError('El pago en línea aún no está disponible. Coordina con la agencia.')
        return
      }

      try {
        await cargarSdkMp()
        if (cancelado || !window.MercadoPago) return
        const mp = new window.MercadoPago(publicKey, { locale: 'es-MX' })
        brickRef.current = await mp.bricks().create('payment', containerId, {
          initialization: { amount },
          customization: { paymentMethods: { creditCard: 'all', debitCard: 'all' } },
          callbacks: {
            // El Brick exige onReady + onError explícitos o rechaza el
            // create() entero con "missing_required_callbacks" — ni siquiera
            // llega a intentar cargar el SDK/red, es una validación del propio
            // objeto de settings.
            onReady: () => setListo(true),
            onError: (err: unknown) => {
              console.error('[MpPaymentBrick] onError', err)
              setError('Hubo un problema con el pago. Intenta de nuevo.')
            },
            onSubmit: async ({ formData }: { formData: Record<string, unknown> }) => {
              const res = await pagarConBrickMarketplace(bookingId, amount, formData)
              if ('error' in res) {
                toast.error(res.error)
                // Lanzar el error hace que el Brick re-habilite el botón.
                throw new Error(res.error)
              }
              onResult(res)
            },
          },
        })
      } catch (err) {
        // Causa #1 real de esto: un bloqueador de anuncios/privacidad filtra
        // sdk.mercadopago.com (varias listas lo marcan como tracker). El
        // error real queda en consola para diagnosticar sin adivinar.
        console.error('[MpPaymentBrick] fallo al cargar/crear el Brick', err)
        if (!cancelado) {
          setError(
            'No se pudo cargar el pago. Si tienes un bloqueador de anuncios/privacidad ' +
              'activado, desactívalo para este sitio o intenta en una ventana de incógnito, ' +
              'y vuelve a intentar.'
          )
        }
      }
    }

    montar()
    return () => {
      cancelado = true
      brickRef.current?.unmount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, amount])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  return (
    <div>
      {!listo && <p className="text-sm text-muted-foreground">Cargando pago…</p>}
      <div id={containerId} />
    </div>
  )
}
