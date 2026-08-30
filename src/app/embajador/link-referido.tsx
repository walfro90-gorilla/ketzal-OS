'use client'

import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { linkReferido, mensajeParaCompartir, waCompartir } from '@/lib/domain/embajador'

/** El link de referido del embajador (`/explora?ref=CODE`), para copiar o mandar
 *  directo por WhatsApp — que es donde realmente lo va a compartir. Antes solo
 *  se podía copiar, y el embajador tenía que redactar el mensaje él mismo. */
export function LinkReferido({ code }: { code: string }) {
  const [url, setUrl] = useState(linkReferido('', code))
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    setUrl(linkReferido(window.location.origin, code))
  }, [code])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin permiso de portapapeles: el texto sigue seleccionable a mano */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">
          {url}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copiar}>
          {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          <span className="sr-only">Copiar link</span>
        </Button>
      </div>
      <a
        href={waCompartir(mensajeParaCompartir(url))}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ className: 'w-full sm:w-auto' })}
      >
        <MessageCircleIcon className="size-4" />
        Compartir por WhatsApp
      </a>
    </div>
  )
}
