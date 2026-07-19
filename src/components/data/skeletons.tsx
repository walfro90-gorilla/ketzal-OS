import { Skeleton } from '@/components/ui/skeleton'

// Piezas de esqueleto reutilizables para armar loading.tsx que se parezcan al
// layout real de cada ruta (campo-primero: nunca pantalla en blanco, y sin el
// salto visual de mostrar una silueta de lista en una pantalla de tarjetas).

/** Encabezado de página: título + acción opcional a la derecha. */
export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>
      {action && <Skeleton className="h-10 w-32 md:h-8" />}
    </div>
  )
}

/** Tarjeta KPI: etiqueta + cifra + detalle. */
function KpiCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/** Fila de KPIs (grid responsivo, igual que /reportes y /dashboard). */
export function KpiRowSkeleton({
  count = 3,
  className = 'grid gap-4 sm:grid-cols-3',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Tarjeta genérica (título + cuerpo alto), para gráficas o bloques anchos. */
export function CardBlockSkeleton({ bodyClassName = 'h-48' }: { bodyClassName?: string }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className={`w-full rounded-lg ${bodyClassName}`} />
    </div>
  )
}

/** Filas apiladas (tarjetas móviles) — el mismo cuerpo que ListSkeleton. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-lg md:border">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-xl border p-4 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
