import type { ComponentType, ReactNode, SVGProps } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Primitivos de la ficha pública (/servicio/[id]) — "un primitivo por patrón":
// título de sección con icono, bloque plegable y badge de cupo. Server-safe.

type Icon = ComponentType<SVGProps<SVGSVGElement>>

/** Título de card con icono lucide: reconocimiento > recuerdo al escanear en móvil. */
export function SeccionTitulo({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      {children}
    </CardTitle>
  )
}

/**
 * Plegable nativo (<details>): funciona desde el primer byte de HTML, sin
 * hidratar, en 3G y en el navegador de WhatsApp; el contenido sigue en el DOM
 * (indexable, buscar-en-página lo abre solo).
 * ponytail: <details> nativo; ui/accordion.tsx sobre @base-ui/react/accordion
 * si algún día se pide apertura exclusiva o animación de cierre.
 */
export function Plegable({
  titulo,
  abierto = false,
  children,
}: {
  titulo: ReactNode
  abierto?: boolean
  children: ReactNode
}) {
  return (
    <details className="group border-b last:border-b-0" open={abierto}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>{titulo}</span>
        <ChevronDownIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pb-3 text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200">
        {children}
      </div>
    </details>
  )
}

/** Cupo de una salida como urgencia legible: agotado / últimos N / N lugares. */
export function CupoBadge({ free }: { free: number }) {
  if (free <= 0) return <Badge variant="destructive">Agotado</Badge>
  if (free <= 5) return <Badge variant="warning">Últimos {free}</Badge>
  return (
    <Badge variant="secondary">
      {free} {free === 1 ? 'lugar' : 'lugares'}
    </Badge>
  )
}
