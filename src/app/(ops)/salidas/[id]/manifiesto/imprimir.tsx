'use client'

import { PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Botón de impresión del manifiesto. El documento vive tras sesión (PII de
// pasajeros): sin token público. Usa el diálogo de impresión del navegador.
export function ImprimirManifiesto() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <PrinterIcon className="size-4" />
      Imprimir
    </Button>
  )
}
