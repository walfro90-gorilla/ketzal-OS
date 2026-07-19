'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Comparte el link público de la página actual por WhatsApp y lo copia al
 * portapapeles. Un solo affordance para las tres superficies compartibles
 * (cotización, estado de cuenta, recibo): mismo botón, mismo toast.
 */
export function CompartirWhatsApp({
  mensaje,
  toastOk = 'Link copiado',
}: {
  /** Texto que antecede al link en el mensaje de WhatsApp. */
  mensaje: string
  toastOk?: string
}) {
  async function handleCompartir() {
    // La URL se lee en el cliente: funciona igual en localhost que en producción.
    const url = window.location.href
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${mensaje} ${url}`)}`,
      '_blank',
      'noopener,noreferrer'
    )
    try {
      await navigator.clipboard.writeText(url)
      toast.success(toastOk)
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
