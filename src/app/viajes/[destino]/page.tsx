import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listPublicServices } from '@/app/explora/data'
import { agruparPorDestino, tituloDestino, type Destino } from '@/lib/marketing/destinos'
import { itemListJsonLd, serializeJsonLd } from '@/lib/marketing/jsonld'
import { SITE_URL } from '@/lib/site-url'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

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
  return {
    title: titulo,
    description,
    alternates: { canonical: `/viajes/${d.slug}` },
    openGraph: { title: titulo, description, type: 'website' },
  }
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(itemListJsonLd(d.servicios, SITE_URL)),
        }}
      />
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
        <Link
          href="/viajes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Todos los destinos
        </Link>

        <header className="mt-4 space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {tituloDestino(d)}
          </h1>
          <p className="text-muted-foreground">{resumen(d)}</p>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Viajes</dt>
            <dd className="text-lg font-semibold tabular-nums">{d.servicios.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Desde</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {d.precioDesde != null ? mxn.format(d.precioDesde) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Próxima salida</dt>
            <dd className="text-lg font-semibold">
              {d.proximaSalida ? fecha(d.proximaSalida) : 'Por confirmar'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Salidas programadas</dt>
            <dd className="text-lg font-semibold tabular-nums">{d.salidasFuturas}</dd>
          </div>
        </dl>

        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">
            {d.servicios.length === 1 ? 'El viaje' : 'Los viajes'}
          </h2>
          <ul className="space-y-3">
            {d.servicios.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/servicio/${s.id}`}
                  className="flex flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-sm text-muted-foreground">
                    Opera {s.agency}
                    {s.city_from ? ` · Sale de ${s.city_from}` : ''}
                    {s.next_departure ? ` · Próxima salida ${fecha(s.next_departure)}` : ''}
                  </span>
                  {Number(s.price ?? 0) > 0 && (
                    <span className="text-sm font-semibold tabular-nums">
                      {mxn.format(Number(s.price))} MXN por persona
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-sm text-muted-foreground">
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
      </main>
      <PublicFooter />
    </>
  )
}
