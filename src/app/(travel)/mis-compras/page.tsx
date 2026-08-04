import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { buttonVariants } from '@/components/ui/button'
import { OrderCard, type Order } from './order-card'
import { PagoProcesando } from './pago-procesando'
import { UsarCredito, type CreditoViajero } from './usar-credito'

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
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Mis compras</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicia sesión para ver tus viajes.
        </p>
        <Link href="/entrar" className={`${buttonVariants()} mt-4`}>
          Entrar
        </Link>
      </div>
    )
  }

  const { data } = await supabase.rpc('list_my_marketplace_orders' as never, {} as never)
  const orders = (data as unknown as Order[]) ?? []

  // C5 (b049): créditos del viajero por cancelaciones — saldo derivado,
  // canjeables en cualquier viaje de Ketzal (los aplica la agencia al reservar).
  const { data: crData } = await supabase.rpc('list_my_credits' as never, {} as never)
  const creditos: CreditoViajero[] = (
    (crData as unknown as (CreditoViajero & { vigente: boolean })[]) ?? []
  ).filter((c) => c.vigente && Number(c.saldo_mxn) > 0)
  const mxnFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

  return (
    <div className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Mis compras</h1>
      {creditos.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Crédito a tu favor</p>
          {creditos.map((c) => (
            <p key={c.id} className="mt-1 text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {mxnFmt.format(Number(c.saldo_mxn))}
              </span>{' '}
              · emitido por {c.agencia} · vence el{' '}
              {new Date(`${c.expira}T00:00:00`).toLocaleDateString('es-MX', {
                dateStyle: 'long',
              })}
            </p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Úsalo en cualquier viaje de Ketzal: al reservar, pide a la agencia
            aplicar tu crédito.
          </p>
        </div>
      )}
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
            <div key={o.booking_id} className="space-y-2">
              <OrderCard order={o} />
              {/* b051: el crédito universal lo aplica el TITULAR (una agencia
                  ajena ya no puede consumirlo). Por eso el botón vive aquí. */}
              <UsarCredito
                bookingId={o.booking_id}
                saldoPedido={Number(o.balance ?? 0)}
                creditos={creditos}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
