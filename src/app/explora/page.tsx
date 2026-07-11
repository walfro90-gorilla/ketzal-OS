import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicServices } from './data'
import { Card, CardContent } from '@/components/ui/card'
import { MapPinIcon } from 'lucide-react'

// Catálogo público (marketplace). SÍ indexable (a diferencia de las páginas por
// token): es la vitrina SEO. Página autocontenida (sin la shell de /ops).

export const metadata: Metadata = {
  title: 'Explora viajes · Ketzal',
  description:
    'Tours, paquetes y experiencias de agencias locales. Reserva con confianza.',
  openGraph: {
    title: 'Explora viajes · Ketzal',
    description:
      'Tours, paquetes y experiencias de agencias locales. Reserva con confianza.',
    type: 'website',
  },
}

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

function destino(city: string | null, state: string | null): string | null {
  const partes = [city, state].filter(Boolean)
  return partes.length ? partes.join(', ') : null
}

export default async function ExploraPage() {
  const servicios = await listPublicServices()

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Explora viajes</h1>
        <p className="text-muted-foreground">
          Tours, paquetes y experiencias de agencias locales.
        </p>
      </header>

      {servicios.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Todavía no hay viajes publicados. Vuelve pronto.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {servicios.map((s) => {
            const lugar = destino(s.city_to, s.state_to) ?? s.location
            return (
              <Link key={s.id} href={`/servicio/${s.id}`} className="group">
                <Card className="h-full overflow-hidden py-0 transition-shadow hover:shadow-md">
                  <div className="aspect-[3/2] w-full overflow-hidden bg-muted">
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.image}
                        alt={s.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <MapPinIcon className="size-8" />
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-1 p-4">
                    <h2 className="line-clamp-2 font-semibold">{s.name}</h2>
                    {lugar && (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5" />
                        {lugar}
                      </p>
                    )}
                    <p className="pt-1 text-sm">
                      <span className="text-muted-foreground">Desde </span>
                      <span className="font-semibold tabular-nums">
                        {mxn.format(Number(s.price ?? 0))}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{s.agency}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
