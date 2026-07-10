'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Comparte el link público del recibo por WhatsApp y lo copia al portapapeles.
 * Mismo UX que compartir cotización / estado de cuenta (wa.me + clipboard + toast).
 */
export function CompartirRecibo() {
  async function handleCompartir() {
    // La URL se lee en el cliente: funciona igual en localhost que en producción.
    const url = window.location.href
    const msg = `Aquí está tu recibo de pago: ${url}`
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      '_blank',
      'noopener,noreferrer'
    )
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link del recibo copiado')
    } catch {
      toast.error('No se pudo copiar el link.')
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleCompartir}>
      Compartir por WhatsApp
    </Button>
  )
}
