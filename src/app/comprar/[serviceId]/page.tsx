import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicService } from '@/app/servicio/[id]/data'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { RegistroComprador, CompletarComprador } from './comprador-forms'

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
  const waDigits = s.agency.phone?.replace(/\D/g, '')

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
      <Link
        href={`/servicio/${s.id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Volver al viaje
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Comprar en línea</h1>

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
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">¡Listo, {mc.full_name}!</p>
            <p className="mt-1 text-muted-foreground">
              El <strong>pago en línea llega muy pronto</strong>. Por ahora
              coordina tu compra directo con la agencia y aparta tu lugar.
            </p>
          </div>
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}?text=${encodeURIComponent(
                `Hola, soy ${mc.full_name}. Quiero comprar en línea "${s.name}"` +
                  (mc.phone ? `. Mi teléfono: ${mc.phone}` : '') +
                  '.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonVariants({ variant: 'default', size: 'touch' })} w-full`}
            >
              Coordinar mi compra por WhatsApp
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              La agencia no tiene WhatsApp configurado. Vuelve a la ficha del
              viaje para ver cómo contactarla.
            </p>
          )}
        </div>
      )}
    </main>
  )
}
