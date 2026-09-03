import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Mosaico de una cifra con su etiqueta. Nace para /usuarios (b093) y su
// expediente, que antes eran tablas planas sin un solo número a la vista.
// ponytail: sin variantes de tamaño; si algún día hace falta, se agrega.

export type TileTone = 'neutral' | 'good' | 'warn' | 'bad'

const TONO: Record<TileTone, string> = {
  neutral: 'text-foreground',
  good: 'text-emerald-600 dark:text-emerald-500',
  warn: 'text-amber-600 dark:text-amber-500',
  bad: 'text-destructive',
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: TileTone
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-3 sm:p-4', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', TONO[tone])}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
