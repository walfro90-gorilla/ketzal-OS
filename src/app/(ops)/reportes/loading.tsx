import {
  HeaderSkeleton,
  KpiRowSkeleton,
  CardBlockSkeleton,
} from '@/components/data/skeletons'

// Esqueleto fiel a Reportes: 6 KPIs + gráficas por agente/servicio/mes.
export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <KpiRowSkeleton
        count={6}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <CardBlockSkeleton bodyClassName="h-52" />
        <CardBlockSkeleton bodyClassName="h-52" />
      </div>
      <CardBlockSkeleton bodyClassName="h-52" />
    </div>
  )
}
