import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPinIcon } from 'lucide-react'
import { listPublicServices } from '@/app/explora/data'
import { agruparPorDestino, fotoDestino } from '@/lib/marketing/destinos'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'
import { BrandMark } from '@/components/brand-mark'

// ADR-0051: índice de destinos. Existe para que las páginas por destino NO sean
// huérfanas: una URL a la que solo llega el sitemap posiciona peor que una
// enlazada desde el sitio. Es también la puerta desde el pie de página.
//
// Usa la foto real del primer viaje de cada destino: las cinco fichas
// publicadas tienen banner, así que no hace falta arte nuevo para que esto deje
// de verse como un listado administrativo.
export const revalidate = 3600

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

function fecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export const metadata: Metadata = {
  title: 'Destinos · Ketzal',
  description:
    'Todos los destinos con viajes publicados: cuántos hay, desde qué precio y cuándo sale el próximo.',
  alternates: { canonical: '/viajes' },
  openGraph: { title: 'Destinos · Ketzal', type: 'website' },
}

export default async function DestinosPage() {
  const destinos = agruparPorDestino(await listPublicServices())
  const total = destinos.reduce((n, d) => n + d.servicios.length, 0)

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        <header className="max-w-2xl space-y-3">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
            ¿A dónde quieres ir?
          </h1>
          {destinos.length > 0 && (
            <p className="text-muted-foreground">
              {total === 1 ? '1 viaje' : `${total} viajes`} a{' '}
              {destinos.length === 1 ? '1 destino' : `${destinos.length} destinos`}, operados
              por agencias locales. Precio final por persona, sin sorpresas.
            </p>
          )}
        </header>

        {destinos.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Todavía no hay viajes publicados. Vuelve pronto.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {destinos.map((d) => {
              const foto = fotoDestino(d)
              return (
                <li key={d.slug}>
                  <Link
                    href={`/viajes/${d.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={foto}
                          alt={`Viajes a ${d.ciudad}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-primary/60">
                          <BrandMark className="size-10" />
                        </div>
                      )}
                      {/* El nombre sobre la foto: es lo que la gente busca. */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
                        <p className="font-display text-lg font-semibold tracking-[-0.01em] text-white">
                          {d.ciudad}
                        </p>
                        {d.estado && d.estado !== d.ciudad && (
                          <p className="flex items-center gap-1 text-xs text-white/80">
                            <MapPinIcon className="size-3" />
                            {d.estado}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-2 p-4">
                      <p className="text-sm text-muted-foreground">
                        {d.servicios.length === 1 ? '1 viaje' : `${d.servicios.length} viajes`}
                        {d.proximaSalida ? ` · sale el ${fecha(d.proximaSalida)}` : ''}
                      </p>
                      {d.precioDesde != null && (
                        <p className="flex items-baseline gap-1.5 text-sm">
                          <span className="text-xs text-muted-foreground">Desde</span>
                          <span className="font-display text-lg font-semibold tabular-nums">
                            {mxn.format(d.precioDesde)}
                          </span>
                          <span className="text-xs text-muted-foreground">/ persona</span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          ¿Buscas algo en particular?{' '}
          <Link href="/explora" className="underline underline-offset-4 hover:text-foreground">
            Explora todos los viajes
          </Link>
          .
        </p>
      </main>
      <PublicFooter />
    </>
  )
}
