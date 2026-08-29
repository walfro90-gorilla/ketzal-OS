import { HeaderSkeleton, RowsSkeleton } from '@/components/data/skeletons'

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <RowsSkeleton rows={4} />
    </div>
  )
}
