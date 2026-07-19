import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Encabezado de página canónico (UI_UX_PLAN §2.7: un solo primitivo por
// patrón). Título + descripción opcional + acción a la derecha (baja de línea
// en móvil) y, en las páginas nuevo/detalle, link "← Volver" arriba del título.
export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string
  description?: ReactNode
  /** Botón/link a la derecha; en móvil envuelve debajo del título. */
  action?: ReactNode
  /** Con `backLabel`, pinta "← {backLabel}" arriba del título. */
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {backLabel}
          </Link>
        )}
        <h1 className={cn('text-2xl font-semibold', backHref && 'mt-1')}>
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
