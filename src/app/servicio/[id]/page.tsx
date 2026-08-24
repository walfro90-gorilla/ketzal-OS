import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicService, getServiceReviews } from './data'
import { Carrusel } from './carrusel'
import { Resenas } from './resenas'
import { CtaBar } from './cta-bar'
import { PrecioCard } from './precio-card'
import { Salidas } from './salidas'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import {
  CheckIcon,
  XIcon,
  MapPinIcon,
  ShieldCheckIcon,
  RouteIcon,
  CircleQuestionMarkIcon,
  MapIcon,
} from 'lucide-react'
import { Plegable, SeccionTitulo } from '@/components/public/ficha-primitivos'
import { videoEmbedUrl } from '@/lib/video'
import { marketplaceActivo } from '@/lib/marketplace'
import { tituloVisible } from '@/lib/display-title'
import { destino, formatTravelDate, mxnEntero } from '@/components/data/format'
import { AgenciaLogo } from '@/components/public/agencia-logo'
import { Compartir } from '@/components/public/compartir'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// Ficha pública de un servicio (marketplace). Indexable (vitrina SEO).
// El CTA "Reservar" apunta hoy a WhatsApp de la agencia; la tajada 3
// (checkout self-service) lo reemplaza por el flujo de reserva + pago.

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
  const description = descripcionSocial(s)
  const url = `/servicio/${id}`

  // El og:image/twitter:image los provee opengraph-image.tsx (banner-como-foto
  // si existe, o tarjeta de marca si no) — por eso aquí no se fija `images`.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url, siteName: 'Ketzal', locale: 'es_MX' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/**
 * Descripción para el preview de WhatsApp/redes: primero lo que vende (fecha,
 * precio, lugares, agencia — datos de la BD, nunca redactados), luego el inicio
 * de la descripción en una sola línea. ≤160 caracteres: WhatsApp corta ahí.
 */
function descripcionSocial(s: NonNullable<Awaited<ReturnType<typeof getPublicService>>>): string {
  const proxima = s.departures?.[0]
  const datos = [
    proxima ? `Sale ${formatTravelDate(proxima.departs_on)}` : null,
    `desde ${mxnEntero.format(Number(s.price ?? 0))} por persona`,
    proxima ? (proxima.free > 0 ? `${proxima.free} lugares` : 'agotado') : null,
    s.agency.name,
  ]
    .filter(Boolean)
    .join(' · ')
  const resto = 160 - datos.length - 2
  const texto = (s.description ?? '').replace(/\s+/g, ' ').trim()
  if (resto < 24 || !texto) return datos
  const corte = texto.length > resto ? `${texto.slice(0, texto.lastIndexOf(' ', resto - 1)).trimEnd()}…` : texto
  return `${datos}. ${corte}`
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
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const { id } = await params
  const { ref: refRaw } = await searchParams
  const refCode = Array.isArray(refRaw) ? refRaw[0] : refRaw
  // Propaga el ?ref del embajador al CTA de compra para que sobreviva el salto.
  const comprarHref = `/comprar/${id}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`
  const s = await getPublicService(id)
  if (!s) return <NotFound />

  const lugar = destino(s)
  // b057: packs mínimos para calcular el "desde" por salida (override o %).
  const packsMin: { key: string; price: number }[] = Array.isArray(s.packs)
    ? (s.packs as { key?: string; price?: number }[])
        .filter((p) => typeof p?.key === 'string' && typeof p?.price === 'number')
        .map((p) => ({ key: p.key as string, price: p.price as number }))
    : []
  // Packs con etiqueta, de menor a mayor precio, para la sección "Precio por persona".
  const packsAll = Array.isArray(s.packs)
    ? (s.packs as { key?: string; label?: string; price?: number }[])
        .filter((p) => typeof p?.key === 'string' && typeof p?.price === 'number')
        .map((p) => ({ key: p.key as string, label: p.label ?? (p.key as string), price: p.price as number }))
        .sort((a, b) => a.price - b.price)
    : []
  // Banner primero, luego la galería (sin duplicar el banner si se repite).
  const fotos = [
    ...(s.images?.imgBanner ? [s.images.imgBanner] : []),
    ...(s.images?.imgAlbum ?? []).filter((u) => u !== s.images?.imgBanner),
  ]
  const embed = videoEmbedUrl(s.yt_link)
  const wa = waLink(s.agency.phone)
  const comprarOnline = marketplaceActivo()
  // Reseñas: parte del sistema de calificaciones (🅰️ social), tras el mismo flag.
  const reviews = comprarOnline ? await getServiceReviews(id) : null
  const cupoLibre =
    s.max_capacity != null ? Math.max(0, s.max_capacity - s.current_bookings) : null

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 sm:py-10 md:pb-10">
      <Link
        href="/explora"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Todos los viajes
      </Link>

      <Carrusel images={fotos} alt={s.name} />

      <header className="mt-6 space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
          {tituloVisible(s.name)}
        </h1>
        {lugar && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPinIcon className="size-4" />
            {lugar}
          </p>
        )}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Ofrecido por
          <Link
            href={`/agencia/${s.agency.id}`}
            className="flex items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline"
          >
            <AgenciaLogo url={s.agency.logo} nombre={s.agency.name} tamano="mini" />
            {s.agency.name}
          </Link>
        </p>

        {/* Compartir aquí y no al final: el momento de mandarle el viaje a
            alguien es cuando acabas de ver la foto y el título. */}
        <Compartir titulo={tituloVisible(s.name)} texto={descripcionSocial(s)} className="pt-1" />
      </header>

      <PrecioCard
        price={Number(s.price ?? 0)}
        packs={packsAll}
        proxima={s.departures?.[0] ?? null}
        cupoLibre={cupoLibre}
        comprarHref={comprarHref}
        comprarOnline={comprarOnline}
        waHref={wa ? `${wa}?text=${encodeURIComponent(`Hola, me interesa el viaje "${s.name}".`)}` : null}
        mailHref={s.agency.email ? `mailto:${s.agency.email}?subject=${encodeURIComponent(`Reserva: ${s.name}`)}` : null}
      />

      <Salidas
        departures={s.all_departures ?? []}
        packsMin={packsMin}
        price={Number(s.price ?? 0)}
        comprarHref={comprarHref}
        comprarOnline={comprarOnline}
      />

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
                <SeccionTitulo icon={ShieldCheckIcon}>Incluye</SeccionTitulo>
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
                <SeccionTitulo icon={XIcon}>No incluye</SeccionTitulo>
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

      {/* La prosa libre va DESPUÉS de lo escaneable (precio, fechas, incluye). */}
      {s.description && (
        <Card className="mt-6">
          <CardHeader>
            <SeccionTitulo icon={MapIcon}>Sobre el viaje</SeccionTitulo>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {s.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Itinerario */}
      {(s.itinerary?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <SeccionTitulo icon={RouteIcon}>Itinerario</SeccionTitulo>
          </CardHeader>
          <CardContent>
            {s.itinerary!.map((dia, i) => (
              <Plegable
                key={i}
                abierto={i === 0}
                titulo={`Día ${i + 1}${dia.title ? ` · ${dia.title}` : ''}`}
              >
                {dia.description}
              </Plegable>
            ))}
          </CardContent>
        </Card>
      )}

      {/* FAQs */}
      {(s.faqs?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <SeccionTitulo icon={CircleQuestionMarkIcon}>Preguntas frecuentes</SeccionTitulo>
          </CardHeader>
          <CardContent>
            {s.faqs!.map((f, i) => (
              <Plegable key={i} titulo={f.question ?? `Pregunta ${i + 1}`}>
                {f.answer}
              </Plegable>
            ))}
          </CardContent>
        </Card>
      )}

      {reviews && <Resenas reviews={reviews} />}
      </main>
      <PublicFooter />
      {/* Hueco para que la barra fija no tape el footer al llegar al fondo. */}
      <div aria-hidden className="h-20 md:hidden" />
      <CtaBar
        desde={Number(s.price ?? 0)}
        comprarHref={comprarHref}
        comprarOnline={comprarOnline}
        wa={wa}
        nombre={s.name}
      />
    </>
  )
}
