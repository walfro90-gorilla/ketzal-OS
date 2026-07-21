import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface BorderBeamProps {
  /** Diámetro del haz, en px. */
  size?: number
  /** Duración de una vuelta completa, en segundos. */
  duration?: number
  /** Grosor del borde, en px. */
  borderWidth?: number
  /** Punto de anclaje del haz sobre el borde (0-100). */
  anchor?: number
  /** Color inicial del gradiente. */
  colorFrom?: string
  /** Color final del gradiente. */
  colorTo?: string
  /** Retraso de arranque, en segundos (útil para desfasar varios haces). */
  delay?: number
  className?: string
}

/**
 * Haz de luz que recorre el borde de su contenedor. CSS puro (offset-path +
 * keyframe `border-beam` de globals.css); sin dependencia de animación.
 *
 * El padre debe ser `relative` con bordes redondeados; el haz hereda el radio
 * (`rounded-[inherit]`). Respeta `prefers-reduced-motion` vía la regla global
 * de accesibilidad en globals.css.
 */
export function BorderBeam({
  className,
  size = 200,
  duration = 12,
  anchor = 90,
  borderWidth = 1.5,
  colorFrom = '#009E7E',
  colorTo = '#00E0A8',
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      aria-hidden
      style={
        {
          '--size': size,
          '--duration': duration,
          '--anchor': anchor,
          '--border-width': borderWidth,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          '--delay': `-${delay}s`,
        } as CSSProperties
      }
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]',
        '![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]',
        'after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam after:[animation-delay:var(--delay)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)] after:[offset-anchor:calc(var(--anchor)*1%)_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))]',
        className,
      )}
    />
  )
}
