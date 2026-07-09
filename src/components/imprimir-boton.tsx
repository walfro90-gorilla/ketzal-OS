'use client'

import { Button } from '@/components/ui/button'

/**
 * Abre el diálogo de impresión del navegador (→ "Guardar como PDF").
 * Se renderiza con `print:hidden` desde quien lo usa para no salir en el PDF.
 */
export function ImprimirBoton({
  label = 'Imprimir / Guardar PDF',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className={className}>
      {label}
    </Button>
  )
}
