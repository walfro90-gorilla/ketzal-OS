import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicService } from '@/app/servicio/[id]/data'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { Card, CardContent } from '@/components/ui/card'
import { RegistroComprador, CompletarComprador } from './comprador-forms'
import { PedidoForm, type Pack } from './pedido-form'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Terreno del marketplace (Fase B.0). Compra en línea: el visitante crea una
// cuenta rápido y se lo encamina a adquirir el servicio. Por ahora SIN pago:
// una vez con cuenta, se coordina la compra con la agencia (handoff WhatsApp);
// el checkout en línea (MP) entra en B.2. Toda la ruta está detrás del flag.

export const metadata = { robots: { index: false } }

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

function destino(s: {
  city_to: string | null
  state_to: string | null
  location: string | null
}) {
  const partes = [s.city_to, s.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : s.location
}

export default async function ComprarPage({
  params,
}: {
  params: Promise<{ serviceId: string }>
}) {
  if (!marketplaceActivo()) notFound()

  const { serviceId } = await params
  const s = await getPublicService(serviceId)
  if (!s) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let mc: { full_name: string; phone: string | null } | null = null
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('marketplace_customers')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle()
    mc = data ?? null
  }

  const lugar = destino(s)

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
      <Link
        href={`/servicio/${s.id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Volver al viaje
      </Link>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Comprar en línea</h1>
        {user && (
          <Link
            href="/mis-compras"
            className="shrink-0 text-sm text-primary underline-offset-2 hover:underline"
          >
            Mis compras →
          </Link>
        )}
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-1 p-4">
          <p className="font-semibold">{s.name}</p>
          {lugar && <p className="text-sm text-muted-foreground">{lugar}</p>}
          <p className="text-sm">
            <span className="text-muted-foreground">Desde </span>
            <span className="font-semibold tabular-nums">
              {mxn.format(Number(s.price ?? 0))}
            </span>{' '}
            <span className="text-muted-foreground">por persona</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Ofrecido por {s.agency.name}
          </p>
        </CardContent>
      </Card>

      {!user ? (
        <RegistroComprador />
      ) : !mc ? (
        <CompletarComprador />
      ) : (
        <PedidoForm
          serviceId={s.id}
          serviceName={s.name}
          packs={(s.packs as Pack[] | null) ?? []}
          departures={s.departures ?? []}
          buyerName={mc.full_name}
          agencyPhone={s.agency.phone}
        />
      )}
      </main>
      <PublicFooter />
    </>
  )
}
