import type { ComponentProps } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// <select> nativo alineado al Input de shadcn: en móvil el picker del SO es
// mejor UX que un dropdown custom. Táctil en móvil (44px), compacto en
// desktop; el `text-base` móvil evita el auto-zoom de iOS al enfocar.
export const nativeSelectClass =
  'h-11 md:h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

// El <select> con appearance-none pierde la flecha nativa: la reponemos con un chevron.
export function NativeSelect({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(nativeSelectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
