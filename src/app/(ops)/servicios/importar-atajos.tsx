'use client'

import { useState } from 'react'
import { FileUpIcon, MessageCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImportarArchivo } from './importar-archivo'
import { ImportarUrl } from './importar-url'
import type { ServicioLeido } from '@/lib/ai/servicio-leido'

type Atajo = 'archivo' | 'whatsapp'

/**
 * Los dos atajos para pre-llenar el servicio (PDF/imagen y link de WhatsApp)
 * arrancan COLAPSADOS: dos botones chicos en fila. Ocupaban toda la parte de
 * arriba con sus tarjetas y empujaban el formulario real fuera de la vista.
 * Al hacer clic se despliega solo el elegido; el otro se cierra.
 */
export function ImportarAtajos({
  onDatos,
}: {
  onDatos: (datos: ServicioLeido) => void
}) {
  const [abierto, setAbierto] = useState<Atajo | null>(null)
  const alternar = (cual: Atajo) =>
    setAbierto((prev) => (prev === cual ? null : cual))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={abierto === 'archivo' ? 'secondary' : 'outline'}
          aria-expanded={abierto === 'archivo'}
          onClick={() => alternar('archivo')}
        >
          <FileUpIcon className="size-4" />
          Llenar desde PDF o imagen
        </Button>
        <Button
          type="button"
          size="sm"
          variant={abierto === 'whatsapp' ? 'secondary' : 'outline'}
          aria-expanded={abierto === 'whatsapp'}
          onClick={() => alternar('whatsapp')}
        >
          <MessageCircleIcon className="size-4" />
          Llenar desde link de WhatsApp
        </Button>
      </div>

      {abierto === 'archivo' && <ImportarArchivo onDatos={onDatos} />}
      {abierto === 'whatsapp' && <ImportarUrl onDatos={onDatos} />}
    </div>
  )
}
