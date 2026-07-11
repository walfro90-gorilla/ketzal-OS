import type { Metadata } from 'next'
import { listPublicServices } from './data'
import { Catalogo } from './catalogo'

// Catálogo público (marketplace). SÍ indexable (a diferencia de las páginas por
// token): es la vitrina SEO. Página autocontenida (sin la shell de /ops).
// El server hace el fetch; <Catalogo> (cliente) hace buscar/filtrar en memoria.

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
        <Catalogo servicios={servicios} />
      )}
    </main>
  )
}
