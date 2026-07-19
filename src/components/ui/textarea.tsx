import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// <textarea> nativo alineado al Input de shadcn. Táctil: `text-base` en móvil
// evita el auto-zoom de iOS al enfocar; compacto (text-sm) en desktop.
const textareaClass =
  'min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 md:px-2.5 py-1.5 text-base md:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(textareaClass, className)} {...props} />
}
