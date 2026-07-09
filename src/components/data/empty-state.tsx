import type { ComponentType, ReactNode } from 'react'

// Estado vacío con icono + texto + CTA opcional. Reemplaza los <p> sueltos de
// "aún no hay…" para invitar a la acción (campo-primero: el vacío guía, no informa).
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      {Icon && (
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
