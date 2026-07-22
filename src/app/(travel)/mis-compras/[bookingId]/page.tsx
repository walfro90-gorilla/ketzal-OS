import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  CalendarIcon,
  UsersIcon,
  MapPinIcon,
  CheckIcon,
  XIcon,
  PhoneIcon,
  MailIcon,
  MessageCircleIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { marketplaceActivo } from '@/lib/marketplace'
import { buttonVariants } from '@/components/ui/button'
import { VoucherViajero } from './voucher-viajero'

// Detalle del viaje del comprador B2C (#6): itinerario, qué incluye/no incluye y
// contacto de la agencia. Datos vía RPC get_my_trip (SECURITY DEFINER, ownership
// por marketplace_customer_id = auth.uid()). Tras el flag del marketplace.
export const metadata = { robots: { index: false } }

type Trip = {
  booking: {
    id: string
    status: string
    travel_date: string | null
    num_pax: number | null
    payment_type: string
  }
  money: { total: number; paid: number; balance: number }
  service: {
    name: string
    description: string | null
    location: string | null
    city_from: string | null
    state_from: string | null
    city_to: string | null
    state_to: string | null
    images: unknown[]
    includes: string[]
    excludes: string[]
    itinerary: { title?: string; description?: string }[]
  }
  agency: { name: string; phone: string | null; email: string | null; logo: string | null } | null
  voucher_id: string | null
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const ESTADO: Record<string, string> = {
  draft: 'Pendiente de pago',
  reserved: 'Apartado (en abonos)',
  paid: 'Pagado',
}

function fechaLarga(d: string | null): string | null {
  if (!d) return null
  // 'YYYY-MM-DD' → fecha local sin corrimiento de zona.
  const [y, m, day] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, day))
}

// wa.me necesita solo dígitos con lada país. Heurística MX: 10 dígitos ⇒ prefija 52.
function waLink(phone: string): string {
  const d = phone.replace(/\D/g, '')
  const full = d.length === 10 ? `52${d}` : d
  return `https://wa.me/${full}`
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  if (!marketplaceActivo()) notFound()
  const { bookingId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data } = await supabase.rpc('get_my_trip' as never, {
    p_booking_id: bookingId,
  } as never)
  const trip = data as unknown as Trip | null
  if (!trip) notFound()

  const { service: sv, booking: bk, money, agency } = trip
  // El voucher acredita el servicio; disponible cuando la compra está apartada/pagada.
  const puedeVoucher = ['reserved', 'confirmed', 'paid'].includes(bk.status)
  const ruta = [sv.city_from, sv.city_to].filter(Boolean).join(' → ') || sv.location
  const fecha = fechaLarga(bk.travel_date)

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:py-8">
      <Link
        href="/mis-compras"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Mis viajes
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight">{sv.name}</h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary">
          {ESTADO[bk.status] ?? bk.status}
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          {ruta && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPinIcon className="size-4 shrink-0" /> <dd>{ruta}</dd>
            </div>
          )}
          {fecha && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarIcon className="size-4 shrink-0" /> <dd className="capitalize">{fecha}</dd>
            </div>
          )}
          {bk.num_pax != null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <UsersIcon className="size-4 shrink-0" />{' '}
              <dd>
                {bk.num_pax} {bk.num_pax === 1 ? 'viajero' : 'viajeros'}
              </dd>
            </div>
          )}
        </dl>
      </header>

      {/* Dinero — resumen; el pago se hace desde la lista Mis viajes. */}
      <section className="mt-5 rounded-xl border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{mxn.format(money.total)}</span>
        </div>
        {money.balance > 0 ? (
          <>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Saldo</span>
              <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-500">
                {mxn.format(money.balance)}
              </span>
            </div>
            <Link
              href="/mis-compras"
              className={`${buttonVariants({ size: 'touch' })} mt-3 w-full`}
            >
              Pagar en Mis viajes
            </Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-primary">Pagado por completo ✓</p>
        )}
      </section>

      {puedeVoucher && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Voucher de servicio
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Preséntalo al operador o al hotel. No muestra montos.
          </p>
          <div className="mt-3">
            <VoucherViajero bookingId={bk.id} voucherId={trip.voucher_id} />
          </div>
        </section>
      )}

      {sv.description && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sobre el viaje
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{sv.description}</p>
        </section>
      )}

      {sv.itinerary.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Itinerario
          </h2>
          <ol className="mt-3 space-y-3">
            {sv.itinerary.map((paso, i) => (
              <li key={i} className="rounded-xl border p-3">
                {paso.title && <p className="font-semibold">{paso.title}</p>}
                {paso.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{paso.description}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {sv.includes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Qué incluye
          </h2>
          <ul className="mt-3 space-y-2">
            {sv.includes.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" /> <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sv.excludes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            No incluye
          </h2>
          <ul className="mt-3 space-y-2">
            {sv.excludes.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <XIcon className="mt-0.5 size-4 shrink-0" /> <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agency && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tu agencia
          </h2>
          <div className="mt-3 rounded-xl border p-4">
            <p className="font-semibold">{agency.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agency.phone && (
                <>
                  <a
                    href={waLink(agency.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <MessageCircleIcon className="mr-1 size-4" /> WhatsApp
                  </a>
                  <a
                    href={`tel:${agency.phone.replace(/\s/g, '')}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <PhoneIcon className="mr-1 size-4" /> Llamar
                  </a>
                </>
              )}
              {agency.email && (
                <a
                  href={`mailto:${agency.email}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <MailIcon className="mr-1 size-4" /> Correo
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
