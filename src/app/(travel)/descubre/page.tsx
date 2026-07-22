import { listPublicServices } from '@/app/explora/data'
import { listPublicSuppliers } from '@/app/agencias/data'
import { Catalogo } from '@/app/explora/catalogo'

// "Explora" DENTRO del shell del viajero (#3). Reusa el mismo catálogo que la
// vitrina pública /explora, pero envuelto por el shell (travel) ⇒ conserva la
// bottom tab bar. /explora sigue siendo la versión pública/SEO para anónimos;
// aquí no se indexa (el viajero ya tiene sesión).
export const metadata = { robots: { index: false } }

export default async function DescubrePage() {
  const [servicios, agencias] = await Promise.all([
    listPublicServices(),
    listPublicSuppliers(),
  ])
  const agenciaIds: Record<string, string> = {}
  for (const a of agencias) agenciaIds[a.name] = a.id

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Explora viajes</h1>
        <p className="text-sm text-muted-foreground">Descubre más experiencias.</p>
      </header>

      {servicios.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Todavía no hay viajes publicados. Vuelve pronto.
        </p>
      ) : (
        <Catalogo servicios={servicios} agenciaIds={agenciaIds} />
      )}
    </div>
  )
}
