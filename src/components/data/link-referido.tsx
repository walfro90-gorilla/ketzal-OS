'use client'

import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { linkReferido, mensajeParaCompartir, waCompartir } from '@/lib/domain/embajador'
import { origenPublico } from '@/lib/site-url'

/** El link de referido (`/explora?ref=CODE`), para copiar o mandar directo por
 *  WhatsApp — que es donde realmente se comparte. Antes solo se podía copiar, y
 *  había que redactar el mensaje a mano.
 *
 *  `compacto` lo aprieta a una sola fila con el botón de WhatsApp como icono:
 *  en el portal del embajador el link es el protagonista, pero en la fila de un
 *  agente en /comisiones es un detalle más de la fila. Vive en components/ y no
 *  bajo app/embajador porque desde m010 lo usan las dos pantallas. */
export function LinkReferido({
  code,
  compacto = false,
}: {
  code: string
  compacto?: boolean
}) {
  const [url, setUrl] = useState(linkReferido('', code))
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(linkReferido(origenPublico(window.location.origin), code))
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

  const copiarBtn = (
    <Button type="button" size="sm" variant="outline" onClick={copiar}>
      {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      <span className="sr-only">Copiar link</span>
    </Button>
  )
  const waHref = waCompartir(mensajeParaCompartir(url))

  if (compacto) {
    return (
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1.5 text-xs">
          {url}
        </code>
        {copiarBtn}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <MessageCircleIcon className="size-4" />
          <span className="sr-only">Compartir por WhatsApp</span>
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">
          {url}
        </code>
        {copiarBtn}
      </div>
      <a
        href={waHref}
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
