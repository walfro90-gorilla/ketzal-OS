'use client'

import { useEffect, useState } from 'react'
import { origenPublico } from '@/lib/site-url'
import { toast } from 'sonner'
import { CheckIcon, LinkIcon, MessageCircleIcon, SendIcon, Share2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Compartir la ficha pública. La URL se lee en el CLIENTE (window.location) para
// que funcione igual en localhost y en producción, mismo criterio que
// `components/data/compartir-whatsapp.tsx` — ese es de documentos internos con un
// solo destino, así que no se reusa: aquí hay varias redes y un botón de copiar.
//
// Los logos de marca salieron de lucide, así que en lugar de inventar paths de
// SVG se usa un glifo correcto por construcción (la "f", la X de dos trazos) o
// el ícono genérico que de verdad corresponde: Telegram ES un avión de papel.

function BotonRed({
  href,
  label,
  className,
  children,
}: {
  href: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Compartir en ${label}`}
      title={`Compartir en ${label}`}
      className={cn(
        'flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className
      )}
    >
      {children}
    </a>
  )
}

export function Compartir({
  titulo,
  texto,
  className,
}: {
  /** Nombre del viaje: encabeza el mensaje. */
  titulo: string
  /** Línea con los datos que venden (fecha, precio, lugares). */
  texto: string
  className?: string
}) {
  const [url, setUrl] = useState('')
  const [nativo, setNativo] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    // Dominio público siempre (la ficha se puede estar viendo desde os.).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${origenPublico(window.location.origin)}${window.location.pathname}${window.location.search}`)
    // `navigator.share` sólo existe en algunos navegadores (móvil casi siempre):
    // se detecta tras montar para no romper la hidratación.
    setNativo(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const mensaje = `${titulo} — ${texto}`
  const enc = encodeURIComponent
  // Sin URL todavía (primer render en el servidor) los enlaces no se pintan.
  if (!url) return <div className={cn('h-10', className)} aria-hidden />

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar el link.')
    }
  }

  async function compartirNativo() {
    try {
      await navigator.share({ title: titulo, text: mensaje, url })
    } catch {
      // El usuario canceló la hoja de compartir: no es un error que avisar.
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="mr-1 text-sm text-muted-foreground">Compartir</span>

      {nativo && (
        <button
          type="button"
          onClick={compartirNativo}
          aria-label="Compartir con otras apps"
          title="Compartir con otras apps"
          className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Share2Icon className="size-4" />
        </button>
      )}

      <BotonRed
        href={`https://wa.me/?text=${enc(`${mensaje} ${url}`)}`}
        label="WhatsApp"
        className="hover:border-[#25D366] hover:text-[#25D366]"
      >
        <MessageCircleIcon className="size-4" />
      </BotonRed>

      <BotonRed
        href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`}
        label="Facebook"
        className="hover:border-[#1877F2] hover:text-[#1877F2]"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M15.4 8.4h-2v-1.2c0-.5.4-.8.8-.8h1.2V4h-1.8A3.2 3.2 0 0 0 10.4 7.2v1.2H8.6v2.4h1.8V20h3v-9.2h2l.4-2.4Z"
          />
        </svg>
      </BotonRed>

      <BotonRed
        href={`https://twitter.com/intent/tweet?text=${enc(mensaje)}&url=${enc(url)}`}
        label="X"
        className="hover:border-foreground hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            d="M5 5l14 14M19 5L5 19"
          />
        </svg>
      </BotonRed>

      <BotonRed
        href={`https://t.me/share/url?url=${enc(url)}&text=${enc(mensaje)}`}
        label="Telegram"
        className="hover:border-[#26A5E4] hover:text-[#26A5E4]"
      >
        <SendIcon className="size-4" />
      </BotonRed>

      <button
        type="button"
        onClick={copiar}
        aria-label="Copiar link"
        title="Copiar link"
        className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {copiado ? (
          <CheckIcon className="size-4 text-primary" />
        ) : (
          <LinkIcon className="size-4" />
        )}
      </button>
    </div>
  )
}
