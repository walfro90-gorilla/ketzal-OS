import { Skeleton } from '@/components/ui/skeleton'

// Esqueleto de la ficha: el link se abre desde el navegador de WhatsApp (a
// veces en 3G) y sin esto el cliente ve una pantalla en blanco durante el
// fetch ("nunca pantalla en blanco", UI_UX_PLAN §2.5). Misma silueta que la
// página real (breadcrumb, foto 2:1, título, card de precio, salidas) y un
// placeholder de la barra fija para que no salte al llegar (CLS ≈ 0).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 pb-28 sm:py-10 md:pb-10">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="aspect-[2/1] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="fixed inset-x-0 bottom-0 h-16 border-t bg-background md:hidden" />
    </main>
  )
}
