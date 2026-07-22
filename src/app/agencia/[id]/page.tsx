import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MapPinIcon,
  GlobeIcon,
  CalendarIcon,
  RouteIcon,
  StarIcon,
} from 'lucide-react'
import {
  getPublicSupplier,
  getSupplierReviews,
  type PublicSupplierTrip,
} from './data'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { marketplaceActivo } from '@/lib/marketplace'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Perfil público de una agencia/proveedor (marketplace, vitrina SEO). Igual que
// la ficha de servicio: página pública autocontenida, sin el shell de la app.
// Fail-closed: solo agencias con >=1 servicio publicado tienen perfil.

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})
const num = new Intl.NumberFormat('es-MX')
const fechaCorta = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// Glifos de marca inline: lucide dejó de exportar Instagram/Facebook. Trazo
// simple, hereda color del botón (currentColor). Uso nominativo (enlace).
function IgGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FbGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 9h3l.5-3H14V4.5c0-.85.3-1.5 1.6-1.5H17V.2C16.6.13 15.6 0 14.6 0 12.3 0 11 1.4 11 3.9V6H8.5v3H11v9h3V9z" />
    </svg>
  )
}

function destinoTrip(t: PublicSupplierTrip): string | null {
  const partes = [t.city_to, t.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : null
}

/** Normaliza un handle/URL de red social a un href absoluto, o null. */
function hrefRed(valor: string | undefined, base: string): string | null {
  const v = valor?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '').replace(/^\/+/, '')
  if (!handle) return null
  return `${base}/${handle}`
}

function hrefWeb(valor: string | undefined): string | null {
  const v = valor?.trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const a = await getPublicSupplier(id)
  if (!a) return { title: 'Agencia no disponible', robots: { index: false } }

  const title = `${a.name} — Agencia de viajes · Ketzal`
  const description =
    a.info.about?.slice(0, 160) ??
    `${a.name}${a.info.city_zone ? ` · ${a.info.city_zone}` : ''}. ${a.active_trips} ${
      a.active_trips === 1 ? 'viaje activo' : 'viajes activos'
    } en Ketzal.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Agencia no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta agencia no existe o aún no tiene viajes publicados.
        </p>
        <Link
          href="/explora"
          className={`${buttonVariants({ variant: 'outline' })} mt-4`}
        >
          Ver todos los viajes
        </Link>
      </div>
    </main>
  )
}

// Estrellas 1-5 (llenas hasta `value`, redondeado). Presentacional.
function Estrellas({ value }: { value: number }) {
  const llenas = Math.round(value)
  return (
    <span className="inline-flex" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={`size-4 ${n <= llenas ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  )
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border bg-card p-4 text-center">
      <Icon className="size-5 text-primary" />
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default async function AgenciaPublicaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const a = await getPublicSupplier(id)
  if (!a) return <NotFound />

  // Reseñas (rating + recientes): solo tras el flag del marketplace (sistema de
  // reseñas dormido hasta que se prenda), consistente con la ficha de servicio.
  const reviews = marketplaceActivo()
    ? await getSupplierReviews(a.trips.map((t) => ({ id: t.id, name: t.name })))
    : null

  const info = a.info
  const anioActual = new Date().getFullYear()
  const aniosOperando =
    info.founded_year && info.founded_year <= anioActual
      ? anioActual - info.founded_year
      : null

  const web = hrefWeb(info.website)
  const ig = hrefRed(info.instagram, 'https://instagram.com')
  const fb = hrefRed(info.facebook, 'https://facebook.com')
  const tieneRedes = Boolean(web || ig || fb)

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <Link
        href="/agencias"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Todas las agencias
      </Link>

      {/* Encabezado: logo + nombre + ubicación */}
      <header className="mt-6 flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40">
          {a.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.logo}
              alt={a.name}
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">
              {a.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{a.name}</h1>
          {info.city_zone && (
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <MapPinIcon className="size-4" />
              {info.city_zone}
            </p>
          )}
          {reviews && reviews.count > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm">
              <Estrellas value={reviews.avg} />
              <span className="font-semibold tabular-nums">{reviews.avg}</span>
              <span className="text-muted-foreground">
                ({reviews.count} {reviews.count === 1 ? 'reseña' : 'reseñas'})
              </span>
            </p>
          )}
        </div>
      </header>

      {/* Métricas */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={RouteIcon}
          value={num.format(a.active_trips)}
          label={a.active_trips === 1 ? 'Viaje activo' : 'Viajes activos'}
        />
        {a.destinations.length > 0 && (
          <StatTile
            icon={MapPinIcon}
            value={num.format(a.destinations.length)}
            label={a.destinations.length === 1 ? 'Destino' : 'Destinos'}
          />
        )}
        {aniosOperando != null && (
          <StatTile
            icon={CalendarIcon}
            value={aniosOperando === 0 ? 'Nuevo' : `${aniosOperando}`}
            label={aniosOperando === 0 ? 'Este año' : 'Años operando'}
          />
        )}
        {info.km_traveled != null && info.km_traveled > 0 && (
          <StatTile
            icon={RouteIcon}
            value={num.format(info.km_traveled)}
            label="Km recorridos"
          />
        )}
      </section>

      {/* Acerca de */}
      {info.about && (
        <section className="mt-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {info.about}
          </p>
        </section>
      )}

      {/* Especialidades */}
      {(info.specialties?.length ?? 0) > 0 && (
        <section className="mt-6 flex flex-wrap gap-2">
          {info.specialties!.map((esp) => (
            <span
              key={esp}
              className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium"
            >
              {esp}
            </span>
          ))}
        </section>
      )}

      {/* Destinos */}
      {a.destinations.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Destinos
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {a.destinations.map((d) => (
              <span
                key={d}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                <MapPinIcon className="size-3" />
                {d}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Fotos */}
      {a.photos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">Galería</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {a.photos.map((url) => (
              <div
                key={url}
                className="overflow-hidden rounded-lg border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Viajes activos */}
      {a.trips.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">
            {a.trips.length === 1 ? 'Viaje activo' : 'Viajes activos'}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {a.trips.map((t) => {
              const lugar = destinoTrip(t)
              return (
                <Link
                  key={t.id}
                  href={`/servicio/${t.id}`}
                  className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="aspect-[2/1] w-full overflow-hidden bg-muted">
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.image}
                        alt={t.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <MapPinIcon className="size-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium leading-tight">{t.name}</p>
                    {lugar && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {lugar}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {mxn.format(Number(t.price ?? 0))}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Reseñas de viajeros */}
      {reviews && reviews.recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">Reseñas de viajeros</h2>
          <div className="mt-3 space-y-3">
            {reviews.recent.map((r, i) => (
              <div key={i} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Estrellas value={r.rating} />
                  <span className="text-xs text-muted-foreground">
                    {fechaCorta.format(new Date(r.created_at))}
                  </span>
                </div>
                {r.comment && (
                  <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.autor} · {r.serviceName}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Redes / contacto */}
      {tieneRedes && (
        <section className="mt-8 flex flex-wrap gap-3">
          {web && (
            <a
              href={web}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <GlobeIcon className="size-4" />
              Sitio web
            </a>
          )}
          {ig && (
            <a
              href={ig}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <IgGlyph className="size-4" />
              Instagram
            </a>
          )}
          {fb && (
            <a
              href={fb}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FbGlyph className="size-4" />
              Facebook
            </a>
          )}
        </section>
      )}
      </main>
      <PublicFooter />
    </>
  )
}
