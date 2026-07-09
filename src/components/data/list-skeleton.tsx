import { Skeleton } from '@/components/ui/skeleton'

// Fallback de carga genérico para las rutas de lista (campo-primero: nunca pantalla en blanco).
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>
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
    </div>
  )
}
