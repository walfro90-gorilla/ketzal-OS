import { ListSkeleton } from '@/components/data/list-skeleton'

// Fallback mientras carga cualquier ruta de (ops); el shell (header + nav) queda intacto.
export default function Loading() {
  return <ListSkeleton />
}
