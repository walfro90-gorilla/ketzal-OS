import {
  HeaderSkeleton,
  KpiRowSkeleton,
  RowsSkeleton,
} from '@/components/data/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Esqueleto fiel a Cobranza: 3 KPIs + barra de búsqueda + lista.
export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton action={false} />
      <KpiRowSkeleton count={3} />
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 w-full sm:max-w-xs md:h-9" />
          <Skeleton className="h-11 w-full sm:w-48 md:h-9" />
        </div>
        <RowsSkeleton rows={5} />
      </div>
    </div>
  )
}
