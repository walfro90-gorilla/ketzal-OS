import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2Icon } from 'lucide-react'
import { listPublicServices } from './data'
import { listPublicSuppliers } from '../agencias/data'
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
  const [servicios, agencias] = await Promise.all([
    listPublicServices(),
    listPublicSuppliers(),
  ])
  // Mapa nombre→id para enlazar la agencia de cada tarjeta a su perfil, sin
  // tener que modificar list_public_services (el catálogo solo trae el nombre).
  const agenciaIds: Record<string, string> = {}
  for (const a of agencias) agenciaIds[a.name] = a.id

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Explora viajes</h1>
          <p className="text-muted-foreground">
            Tours, paquetes y experiencias de agencias locales.
          </p>
        </div>
        <Link
          href="/agencias"
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Building2Icon className="size-4" />
          Ver agencias
        </Link>
      </header>

      {servicios.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Todavía no hay viajes publicados. Vuelve pronto.
        </p>
      ) : (
        <Catalogo servicios={servicios} agenciaIds={agenciaIds} />
      )}
    </main>
  )
}
