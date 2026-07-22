import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { buttonVariants } from '@/components/ui/button'
import { OrderCard, type Order } from './order-card'
import { PagoProcesando } from './pago-procesando'

// "Mis compras" del comprador B2C (B.3). Lista sus pedidos vía RPC SECURITY
// DEFINER (el comprador no tiene RLS sobre bookings). Aquí paga los abonos
// siguientes y califica el viaje. Tras el flag del marketplace.
export const metadata = { robots: { index: false } }

export default async function MisComprasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!marketplaceActivo()) notFound()

  // MP agrega sus params al regresar (status/collection_status/payment_id).
  // Su presencia = el comprador acaba de volver de pagar → mostrar "validando".
  const sp = await searchParams
  const volviendoDePago =
    sp.status != null || sp.collection_status != null || sp.payment_id != null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Mis compras</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicia sesión para ver tus viajes.
        </p>
        <Link href="/explora" className={`${buttonVariants({ variant: 'outline' })} mt-4`}>
          Explorar viajes
        </Link>
      </main>
    )
  }

  const { data } = await supabase.rpc('list_my_marketplace_orders' as never, {} as never)
  const orders = (data as unknown as Order[]) ?? []

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Mis compras</h1>
      {volviendoDePago && <PagoProcesando />}
      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Aún no tienes viajes.{' '}
          <Link href="/explora" className="underline">
            Explora
          </Link>{' '}
          y reserva el primero.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <OrderCard key={o.booking_id} order={o} />
          ))}
        </div>
      )}
    </main>
  )
}
