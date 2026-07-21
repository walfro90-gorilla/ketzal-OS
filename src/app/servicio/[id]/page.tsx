import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicService, getServiceReviews } from './data'
import { Carrusel } from './carrusel'
import { Resenas } from './resenas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { CheckIcon, XIcon, MapPinIcon } from 'lucide-react'
import { videoEmbedUrl } from '@/lib/video'
import { marketplaceActivo } from '@/lib/marketplace'
import { esDemoReviews, demoServiceReviews } from '@/lib/demo/reviews'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Ficha pública de un servicio (marketplace). Indexable (vitrina SEO).
// El CTA "Reservar" apunta hoy a WhatsApp de la agencia; la tajada 3
// (checkout self-service) lo reemplaza por el flujo de reserva + pago.

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

function destino(s: { city_to: string | null; state_to: string | null; location: string | null }) {
  const partes = [s.city_to, s.state_to].filter(Boolean)
  return partes.length ? partes.join(', ') : s.location
}

// ponytail: normalización ingenua para wa.me (MX). Si son 10 dígitos, antepone
// 52. Suficiente para el interín; el checkout real llega en la tajada 3.
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const full = digits.length === 10 ? `52${digits}` : digits
  return `https://wa.me/${full}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const s = await getPublicService(id)
  if (!s) return { title: 'Servicio no disponible', robots: { index: false } }

  const lugar = destino(s)
  const title = `${s.name}${lugar ? ` · ${lugar}` : ''} — Ketzal`
  const description =
    s.description?.slice(0, 160) ??
    `${s.name} con ${s.agency.name}. Desde ${mxn.format(Number(s.price ?? 0))}.`

  // El og:image/twitter:image los provee opengraph-image.tsx (banner-como-foto
  // si existe, o tarjeta de marca si no) — por eso aquí no se fija `images`.
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Viaje no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este viaje no existe o ya no está publicado.
          </p>
          <Link href="/explora" className={`${buttonVariants({ variant: 'outline' })} mt-4`}>
            Ver todos los viajes
          </Link>
        </div>
      </main>
      <PublicFooter />
    </>
  )
}

export default async function ServicioPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const s = await getPublicService(id)
  if (!s) return <NotFound />

  const lugar = destino(s)
  // Banner primero, luego la galería (sin duplicar el banner si se repite).
  const fotos = [
    ...(s.images?.imgBanner ? [s.images.imgBanner] : []),
    ...(s.images?.imgAlbum ?? []).filter((u) => u !== s.images?.imgBanner),
  ]
  const embed = videoEmbedUrl(s.yt_link)
  const wa = waLink(s.agency.phone)
  const comprarOnline = marketplaceActivo()
  // Reseñas: parte del sistema de calificaciones (🅰️ social), tras el mismo flag.
  // `?preview=reviews` pinta datos de ejemplo sin BD ni flag (demo).
  const demo = esDemoReviews((await searchParams).preview)
  const reviews = demo
    ? demoServiceReviews()
    : comprarOnline
      ? await getServiceReviews(id)
      : null
  const cupoLibre =
    s.max_capacity != null ? Math.max(0, s.max_capacity - s.current_bookings) : null

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <Link
        href="/explora"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Todos los viajes
      </Link>

      <Carrusel images={fotos} alt={s.name} />

      <header className="mt-6 space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{s.name}</h1>
        {lugar && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPinIcon className="size-4" />
            {lugar}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Ofrecido por{' '}
          <Link
            href={`/agencia/${s.agency.id}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {s.agency.name}
          </Link>
        </p>
      </header>

      {/* Precio + CTA */}
      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Desde</p>
            <p className="text-2xl font-bold tabular-nums">
              {mxn.format(Number(s.price ?? 0))}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                por persona
              </span>
            </p>
            {cupoLibre != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {cupoLibre > 0 ? `${cupoLibre} lugares disponibles` : 'Agotado'}
              </p>
            )}
          </div>
          {/* CTA de conversión: full-width y táctil (44px) en el teléfono. Con
              el flag del marketplace, "Comprar en línea" es la acción primaria y
              WhatsApp pasa a secundaria. */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {comprarOnline && (
              <Link
                href={`/comprar/${s.id}`}
                className={`${buttonVariants({ variant: 'default', size: 'touch' })} w-full sm:w-auto`}
              >
                Comprar en línea
              </Link>
            )}
            {wa ? (
              <a
                href={`${wa}?text=${encodeURIComponent(`Hola, me interesa el viaje "${s.name}".`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonVariants({ variant: comprarOnline ? 'outline' : 'default', size: 'touch' })} w-full sm:w-auto`}
              >
                Reservar por WhatsApp
              </a>
            ) : s.agency.email ? (
              <a
                href={`mailto:${s.agency.email}?subject=${encodeURIComponent(`Reserva: ${s.name}`)}`}
                className={`${buttonVariants({ variant: comprarOnline ? 'outline' : 'default', size: 'touch' })} w-full sm:w-auto`}
              >
                Pedir informes
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {s.description && (
        <section className="mt-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {s.description}
          </p>
        </section>
      )}

      {embed && (
        <section className="mt-6">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted">
            <iframe
              src={embed}
              title={`Video de ${s.name}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              className="h-full w-full"
            />
          </div>
        </section>
      )}

      {/* Incluye / No incluye */}
      {((s.includes?.length ?? 0) > 0 || (s.excludes?.length ?? 0) > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(s.includes?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incluye</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {s.includes!.map((it, i) => (
                    <li key={i} className="flex gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      {it}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {(s.excludes?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No incluye</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {s.excludes!.map((it, i) => (
                    <li key={i} className="flex gap-2 text-muted-foreground">
                      <XIcon className="mt-0.5 size-4 shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Itinerario */}
      {(s.itinerary?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Itinerario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.itinerary!.map((dia, i) => (
              <div key={i}>
                <p className="text-sm font-semibold">
                  Día {i + 1}
                  {dia.title ? `: ${dia.title}` : ''}
                </p>
                {dia.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {dia.description}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* FAQs */}
      {(s.faqs?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Preguntas frecuentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.faqs!.map((f, i) => (
              <div key={i}>
                {f.question && <p className="text-sm font-semibold">{f.question}</p>}
                {f.answer && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{f.answer}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {reviews && <Resenas reviews={reviews} />}
      </main>
      <PublicFooter />
    </>
  )
}
