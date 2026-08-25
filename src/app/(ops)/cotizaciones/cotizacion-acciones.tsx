'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'

// Táctil en móvil (40px) sin perder lo compacto del desktop (28px).
const accionTactil = 'h-10 md:h-7'

export function CotizacionAcciones({
  bookingId,
  quoteToken,
  clienteNombre,
  agenciaNombre,
}: {
  bookingId: string
  quoteToken: string
  clienteNombre: string
  agenciaNombre: string
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const path = `/cotizacion/${quoteToken}`

  // El link público se arma en el cliente con window.location.origin
  // (funciona igual en localhost que en producción).
  function publicUrl() {
    return `${window.location.origin}${path}`
  }

  function handleWhatsAppClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const msg = `Hola ${clienteNombre}, aquí está tu cotización de ${agenciaNombre}: ${publicUrl()}`
    e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(msg)}`
  }

  async function handleCopy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(publicUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar el link.')
    }
  }

  // b070: sin "Convertir a venta" — la única forma de que una cotización se
  // vuelva venta es un abono real (que la asciende solo desde el Detalle).
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/ventas/${bookingId}`}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            accionTactil
          )}
        >
          Detalle
        </Link>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            accionTactil
          )}
        >
          Ver
        </a>
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleWhatsAppClick}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            accionTactil
          )}
        >
          WhatsApp
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={accionTactil}
          onClick={handleCopy}
        >
          {copied ? '¡Copiado!' : 'Copiar link'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
