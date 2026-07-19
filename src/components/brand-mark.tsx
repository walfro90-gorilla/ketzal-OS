import { cn } from '@/lib/utils'

/**
 * Mark de marca inline (hoja/pluma del quetzal, mismo trazo que
 * lib/brand-icon.tsx). Hereda color vía currentColor: úsalo con
 * `text-primary` para el teal Ketzal. Swappable por el logo real
 * cuando exista, sin tocar a los consumidores.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={cn('size-6', className)}
    >
      <path
        d="M50 6 C76 26 76 68 50 94 C24 68 24 26 50 6 Z"
        fill="currentColor"
        opacity="0.15"
      />
      <path
        d="M50 6 C76 26 76 68 50 94 C24 68 24 26 50 6 Z"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="M50 22 L50 84"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M50 40 L66 31 M50 54 L67 46 M50 40 L34 31 M50 54 L33 46"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
