import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicService } from '@/app/servicio/[id]/data'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
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
  searchParams,
}: {
  params: Promise<{ serviceId: string }>
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  if (!marketplaceActivo()) notFound()

  const { serviceId } = await params
  const { ref: refRaw } = await searchParams
  const refCode = Array.isArray(refRaw) ? refRaw[0] : (refRaw ?? null)
  const s = await getPublicService(serviceId)
  if (!s) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let mc: { name: string; phone: string | null } | null = null
  let profileType: string | null = null
  if (user) {
    // Viajero = profile type='viajero' (F1). RLS profiles_select_own: su propia fila.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('profiles')
      .select('name, phone, type')
      .eq('id', user.id)
      .maybeSingle()
    profileType = (data?.type as string | null) ?? null
    mc = data ? { name: data.name, phone: data.phone } : null
  }
  // Sesión que NO es de viajero (agente/embajador/proveedor): comprar en línea es
  // solo con cuenta de comprador. Se avisa y se ofrece crear una (evita el toast
  // críptico "Solo compradores registrados pueden pedir." del RPC sin salida).
  const noEsViajero = !!user && profileType != null && profileType !== 'viajero'
  const tipoLabel =
    profileType === 'embajador'
      ? 'embajador'
      : profileType === 'proveedor'
        ? 'proveedor'
        : 'agente de agencia'

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
      ) : noEsViajero ? (
        <div className="mt-6 space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">
            Solo compradores registrados pueden pedir.
          </p>
          <p className="text-sm text-muted-foreground">
            Tu sesión es de {tipoLabel}, no de comprador. Para comprar en línea
            necesitas una cuenta de viajero.
          </p>
          <Link href="/entrar" className={buttonVariants({ size: 'touch' })}>
            Crear cuenta de comprador
          </Link>
          <p className="text-xs text-muted-foreground">
            Si estás con una cuenta de agente, cierra sesión primero.
          </p>
        </div>
      ) : !mc ? (
        <CompletarComprador />
      ) : (
        <PedidoForm
          serviceId={s.id}
          serviceName={s.name}
          packs={(s.packs as Pack[] | null) ?? []}
          departures={s.departures ?? []}
          buyerName={mc.name}
          agencyPhone={s.agency.phone}
          refCode={refCode}
        />
      )}
      </main>
      <PublicFooter />
    </>
  )
}
