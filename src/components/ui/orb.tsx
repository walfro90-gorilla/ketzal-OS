import { cn } from '@/lib/utils'
import './orb.css'

// Loader "thinking orb" (esfera con gradiente animado). Presentacional; úsalo en
// estados de carga: pending de una acción, búsqueda, o una pantalla de proceso.
const ORB_SIZES = {
  xs: '1rem',
  sm: '1.25rem',
  md: '2.5rem',
  lg: '4rem',
  xl: '6rem',
} as const

export type OrbSize = keyof typeof ORB_SIZES

export function Orb({
  size = 'md',
  className,
  label = 'Cargando…',
  decorative = false,
}: {
  size?: OrbSize
  className?: string
  /** Texto para lectores de pantalla (role=status). */
  label?: string
  /** true = decorativo (aria-hidden), p.ej. dentro de un botón que ya anuncia aria-busy. */
  decorative?: boolean
}) {
  return (
    <span
      className={cn('orb', className)}
      style={{ ['--orb-size' as string]: ORB_SIZES[size] }}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'status', 'aria-label': label })}
    />
  )
}

// Loader de pantalla completa centrado (para loading.tsx o estados de proceso).
export function OrbLoader({
  size = 'lg',
  text,
  className,
}: {
  size?: OrbSize
  text?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-1 flex-col items-center justify-center gap-4 py-12',
        className
      )}
    >
      <Orb size={size} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}
