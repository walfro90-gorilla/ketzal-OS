import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicServices } from '@/app/explora/data'
import { agruparPorDestino } from '@/lib/marketing/destinos'
import { PublicHeader } from '@/components/public/public-header'
import { PublicFooter } from '@/components/public/public-footer'

// ADR-0051: índice de destinos. Existe para que las páginas por destino NO sean
// huérfanas: una URL a la que solo llega el sitemap posiciona peor que una
// enlazada desde el sitio. Es también la puerta desde el pie de página.
export const revalidate = 3600

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

export const metadata: Metadata = {
  title: 'Destinos · Ketzal',
  description:
    'Todos los destinos con viajes publicados: cuántos hay, desde qué precio y cuándo sale el próximo.',
  alternates: { canonical: '/viajes' },
  openGraph: { title: 'Destinos · Ketzal', type: 'website' },
}

export default async function DestinosPage() {
  const destinos = agruparPorDestino(await listPublicServices())

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Destinos</h1>
          <p className="text-muted-foreground">
            A dónde puedes viajar hoy con las agencias de Ketzal.
          </p>
        </header>

        {destinos.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Todavía no hay viajes publicados. Vuelve pronto.
          </p>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {destinos.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/viajes/${d.slug}`}
                  className="flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium">
                    {d.ciudad}
                    {d.estado && d.estado !== d.ciudad ? `, ${d.estado}` : ''}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {d.servicios.length === 1 ? '1 viaje' : `${d.servicios.length} viajes`}
                    {d.precioDesde != null ? ` · desde ${mxn.format(d.precioDesde)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
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
