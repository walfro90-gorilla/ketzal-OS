import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPinIcon, RouteIcon, Building2Icon, StarIcon } from 'lucide-react'
import { listPublicSuppliers, getAgencyRatings } from './data'
import { listPublicServices } from '../explora/data'
import { marketplaceActivo } from '@/lib/marketplace'

// Directorio público de agencias (vitrina SEO). Complementa /explora: allí se
// ven los viajes, aquí quién los opera. Página pública autocontenida, sin el
// shell de la app (igual que /explora y /servicio).

export const metadata: Metadata = {
  title: 'Agencias de viajes — Ketzal',
  description:
    'Conoce las agencias que operan viajes en Ketzal: ecoturismo, aventura y más en Chihuahua y todo México.',
  openGraph: {
    title: 'Agencias de viajes — Ketzal',
    description:
      'Conoce las agencias que operan viajes en Ketzal: ecoturismo, aventura y más.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Agencias de viajes — Ketzal' },
}

// Indicador compacto de rating para las tarjetas (una estrella + promedio).
function RatingChip({ value, count }: { value: number; count: number }) {
  return (
    <span className="flex items-center gap-1">
      <StarIcon className="size-3.5 fill-primary text-primary" />
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span>({count})</span>
    </span>
  )
}

export default async function AgenciasPage() {
  const conRating = marketplaceActivo()
  const [agencias, servicios] = await Promise.all([
    listPublicSuppliers(),
    conRating ? listPublicServices() : Promise.resolve([]),
  ])

  // Rating por agencia (tras el flag): agrupo los servicios del catálogo por
  // agencia (nombre → id) y agrego sus reseñas. Sin cambios de BD.
  let ratings: Record<string, { count: number; avg: number }> = {}
  if (conRating && agencias.length > 0) {
    const nombreAId: Record<string, string> = {}
    for (const a of agencias) nombreAId[a.name] = a.id
    const serviciosPorAgencia: Record<string, string[]> = {}
    for (const s of servicios) {
      const aid = nombreAId[s.agency]
      if (aid) (serviciosPorAgencia[aid] ??= []).push(s.id)
    }
    ratings = await getAgencyRatings(
      agencias.map((a) => ({ id: a.id, serviceIds: serviciosPorAgencia[a.id] ?? [] }))
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <Link
        href="/explora"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Explorar viajes
      </Link>

      <header className="mt-4 space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">Agencias de viajes</h1>
        <p className="text-muted-foreground">
          Conoce a quién opera cada viaje. Toca una agencia para ver su perfil.
        </p>
      </header>

      {agencias.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Building2Icon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no hay agencias con viajes publicados.
          </p>
          <Link
            href="/explora"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todos los viajes
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {agencias.map((a) => {
            const rating = ratings[a.id]
            return (
            <Link
              key={a.id}
              href={`/agencia/${a.id}`}
              className="group flex gap-4 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
                {a.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.logo}
                    alt={a.name}
                    className="max-h-full max-w-full object-contain p-1.5"
                  />
                ) : (
                  <span className="text-xl font-bold text-muted-foreground">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-tight group-hover:text-primary">
                  {a.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {a.city_zone && (
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="size-3.5" />
                      {a.city_zone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <RouteIcon className="size-3.5" />
                    {a.active_trips}{' '}
                    {a.active_trips === 1 ? 'viaje activo' : 'viajes activos'}
                  </span>
                  {rating && rating.count > 0 && (
                    <RatingChip value={rating.avg} count={rating.count} />
                  )}
                </div>
                {a.specialties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.specialties.slice(0, 3).map((esp) => (
                      <span
                        key={esp}
                        className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium capitalize"
                      >
                        {esp}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
