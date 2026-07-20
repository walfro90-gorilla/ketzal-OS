'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

/**
 * Interruptor on/off (base-nova). Riel + perilla animada por tokens; el estado
 * "checked" usa el acento de marca (primary). Táctil en móvil sin perder
 * compacidad en escritorio.
 */
function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'data-[checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-input/50 dark:data-[checked]:bg-primary',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform',
          'data-[checked]:translate-x-5'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
