import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDaysIcon, MapPinIcon } from 'lucide-react'
import { listPublicServices } from '@/app/explora/data'
import {
  agruparPorDestino,
  fotoDestino,
  lugarDestino,
  tituloDestino,
  type Destino,
} from '@/lib/marketing/destinos'
import { contenidoDe } from '@/lib/marketing/destinos-contenido'
import { itemListJsonLd, serializeJsonLd } from '@/lib/marketing/jsonld'
import { SITE_URL } from '@/lib/site-url'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'
import { BrandMark } from '@/components/brand-mark'

// ADR-0051: una página por destino, generada del catálogo. NO es un /explora
// filtrado: existe para responder en texto la pregunta que la gente escribe
// ("tours a Creel desde Ciudad Juárez precio") con los datos que ya tenemos —
// origen, precio desde, próxima salida y quién opera. Nada inventado: si el
// dato no está en el catálogo, no se afirma.
//
// Dinámica, como /explora y la ficha: el catálogo se lee con el cliente de
// Supabase, que usa cookies, así que no puede prerenderizarse en el build (no
// hay `generateStaticParams` por eso). `revalidate` deja la respuesta cacheable
// una hora para que el crawler no pegue a la BD en cada visita.
export const revalidate = 3600

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

/** Fecha legible sin zona horaria: `departs_on` es un día, no un instante. */
function fecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

async function buscarDestino(slug: string): Promise<Destino | null> {
  const destinos = agruparPorDestino(await listPublicServices())
  return destinos.find((d) => d.slug === slug) ?? null
}

/** Resumen fáctico, la misma frase que sirve de descripción y de entrada. */
function resumen(d: Destino): string {
  const partes = [
    d.servicios.length === 1
      ? `1 viaje a ${d.ciudad}`
      : `${d.servicios.length} viajes a ${d.ciudad}`,
    d.origenes.length === 1 ? `desde ${d.origenes[0]}` : null,
    d.precioDesde != null ? `desde ${mxn.format(d.precioDesde)} MXN por persona` : null,
    d.proximaSalida ? `próxima salida el ${fecha(d.proximaSalida)}` : null,
  ].filter(Boolean)
  return `${partes.join(', ')}.`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ destino: string }>
}): Promise<Metadata> {
  const { destino } = await params
  const d = await buscarDestino(destino)
  if (!d) return { title: 'Destino no encontrado · Ketzal' }
  const titulo = `${tituloDestino(d)} · Ketzal`
  const description = resumen(d)
  const foto = fotoDestino(d)
  return {
    title: titulo,
    description,
    alternates: { canonical: `/viajes/${d.slug}` },
    openGraph: {
      title: titulo,
      description,
      type: 'website',
      ...(foto ? { images: [foto] } : {}),
    },
  }
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="font-display mt-0.5 text-lg font-semibold tracking-[-0.01em]">{valor}</dd>
    </div>
  )
}

export default async function DestinoPage({
  params,
}: {
  params: Promise<{ destino: string }>
}) {
  const { destino } = await params
  const d = await buscarDestino(destino)
  // Un destino sin viajes publicados no debe existir como URL: sería una página
  // vacía indexable, que es peor que no tenerla.
  if (!d) notFound()

  const foto = fotoDestino(d)
  // Contenido editorial: solo si alguien que estuvo ahí lo escribió. Sin texto,
  // la sección no existe — nunca se rellena con prosa inventada.
  const info = contenidoDe(d.slug)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(itemListJsonLd(d.servicios, SITE_URL)),
        }}
      />
      <PublicHeader />
      <main className="flex-1">
        {/* Portada con la foto real del viaje: el material ya existe, y es lo
            que convierte un listado en una página de destino. */}
        <div className="relative isolate overflow-hidden bg-muted">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto}
              alt={`Viajes a ${d.ciudad}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-primary/50">
              <BrandMark className="size-16" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
          <div className="relative mx-auto w-full max-w-4xl px-4 pb-8 pt-16 sm:pb-12 sm:pt-28">
            {/* Chip propio: el degradado es tenue arriba y sobre una foto clara
                el enlace se perdía. Contraste que no depende de la imagen. */}
            <Link
              href="/viajes"
              className="inline-flex rounded-full bg-black/50 px-3 py-1 text-sm text-white/90 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
            >
              ← Todos los destinos
            </Link>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-[-0.02em] text-balance text-white sm:text-5xl">
              {tituloDestino(d)}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-white/80">
              <MapPinIcon className="size-4" />
              {lugarDestino(d)}
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
          <p className="text-lg text-muted-foreground text-balance">{resumen(d)}</p>

          <dl className="mt-6 grid grid-cols-2 gap-6 rounded-2xl border p-5 sm:grid-cols-4">
            <Dato
              etiqueta="Viajes"
              valor={String(d.servicios.length)}
            />
            <Dato
              etiqueta="Desde"
              valor={d.precioDesde != null ? mxn.format(d.precioDesde) : '—'}
            />
            <Dato
              etiqueta="Próxima salida"
              valor={d.proximaSalida ? fecha(d.proximaSalida) : 'Por confirmar'}
            />
            <Dato etiqueta="Salidas programadas" valor={String(d.salidasFuturas)} />
          </dl>

          {info && (
            <section className="mt-10 space-y-4">
              <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
                Sobre {d.ciudad}
              </h2>
              <div className="space-y-3 leading-relaxed text-muted-foreground">
                {info.ubicacion && <p>{info.ubicacion}</p>}
                {info.comoLlegar && <p>{info.comoLlegar}</p>}
                {info.porQue && <p>{info.porQue}</p>}
                {info.cuandoIr && <p>{info.cuandoIr}</p>}
              </div>
              {info.queVisitar && info.queVisitar.length > 0 && (
                <div className="pt-2">
                  <h3 className="font-display text-base font-semibold">Qué visitar</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {info.queVisitar.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="mt-10 space-y-4">
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
              {d.servicios.length === 1 ? 'El viaje' : 'Los viajes'}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {d.servicios.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/servicio/${s.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-muted">
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.image}
                          alt={s.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary/60">
                          <BrandMark className="size-10" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                      <h3 className="font-display font-semibold tracking-[-0.01em] group-hover:text-primary">
                        {s.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Opera {s.agency}
                        {s.city_from ? ` · Sale de ${s.city_from}` : ''}
                      </p>
                      {s.next_departure && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarDaysIcon className="size-3.5" />
                          Próxima salida {fecha(s.next_departure)}
                        </p>
                      )}
                      {Number(s.price ?? 0) > 0 && (
                        <p className="mt-auto flex items-baseline gap-1.5 pt-2 text-sm">
                          <span className="text-xs text-muted-foreground">Desde</span>
                          <span className="font-display text-lg font-semibold tabular-nums">
                            {mxn.format(Number(s.price))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            MXN / persona
                          </span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-10 text-sm text-muted-foreground">
            Los precios son por persona en pesos mexicanos. El lugar se confirma al
            pagar; consulta la{' '}
            <Link
              href="/politica-cancelacion"
              className="underline underline-offset-4 hover:text-foreground"
            >
              política de cancelación
            </Link>{' '}
            antes de reservar.
          </p>
        </div>
      </main>
      <PublicFooter />
    </>
  )
}
