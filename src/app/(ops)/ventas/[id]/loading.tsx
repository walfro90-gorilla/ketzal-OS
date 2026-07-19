import { CardBlockSkeleton } from '@/components/data/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// Esqueleto fiel al detalle de venta: encabezado con folio/estado + tarjetas
// (datos, líneas, plan de pagos, abonos), en vez de la silueta de lista.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <CardBlockSkeleton bodyClassName="h-28" />
      <CardBlockSkeleton bodyClassName="h-40" />
      <CardBlockSkeleton bodyClassName="h-36" />
      <CardBlockSkeleton bodyClassName="h-40" />
    </div>
  )
}
