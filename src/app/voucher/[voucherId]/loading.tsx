import { Skeleton } from '@/components/ui/skeleton'

// Esqueleto del voucher público: se abre desde el navegador de WhatsApp (a
// veces 3G); sin esto se vería pantalla en blanco durante el fetch.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:py-12">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto h-4 w-32" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </main>
  )
}
