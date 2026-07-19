import {
  HeaderSkeleton,
  KpiRowSkeleton,
  CardBlockSkeleton,
} from '@/components/data/skeletons'

// Esqueleto fiel al Panel: atención + KPIs del periodo + gráficas + donas,
// para que no salte del layout al hidratar (el genérico mostraba una lista).
export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <KpiRowSkeleton count={3} />
      <KpiRowSkeleton
        count={6}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      />
      <CardBlockSkeleton bodyClassName="h-56" />
      <div className="grid gap-6 lg:grid-cols-2">
        <CardBlockSkeleton bodyClassName="h-44" />
        <CardBlockSkeleton bodyClassName="h-44" />
      </div>
    </div>
  )
}
