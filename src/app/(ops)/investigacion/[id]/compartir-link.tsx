'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// La liga que se pega en el anuncio de Meta. Los UTM vienen ya puestos: sin
// ellos, /investigacion no puede decir qué campaña trajo cada voto.

export function CompartirLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles el input sigue siendo seleccionable a mano.
    }
  }

  return (
    <div className="flex gap-2">
      <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <Button variant="outline" onClick={copiar} aria-label="Copiar liga">
        {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </Button>
    </div>
  )
}
