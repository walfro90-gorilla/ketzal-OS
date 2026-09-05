import Link from 'next/link'
import { ExternalLinkIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { listPublicServices } from '@/app/explora/data'
import { agruparPorDestino } from '@/lib/marketing/destinos'
import { PageHeader } from '@/components/data/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DestinoForm, type DestinoFila } from './destino-form'

// ADR-0053: panel del contenido de destinos. La LISTA no se administra aquí:
// sale del catálogo publicado (la ciudad de destino de cada viaje). Esta
// pantalla solo llena lo editorial de cada uno. Una fila sin viajes queda
// marcada como huérfana en vez de desaparecer callada — es el único caso donde
// tiene sentido borrar.
export const dynamic = 'force-dynamic'

type FilaBD = {
  slug: string
  nombre: string
  estado: string | null
  pais: string
  lat: number | null
  lng: number | null
  ubicacion: string | null
  como_llegar: string | null
  por_que: string | null
  cuando_ir: string | null
  que_visitar: string[] | null
  publicado: boolean
}

export default async function DestinosAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfil } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null }

  if (perfil?.role !== 'superadmin') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Destinos"
          description="Solo el god admin edita el contenido público de los destinos."
        />
      </div>
    )
  }

  // La RLS de `destinos` ya es solo-superadmin; el cast es por los tipos
  // generados, que no conocen la tabla (convención del repo).
  const [{ data: filasBD }, servicios] = await Promise.all([
    supabase.from('destinos' as never).select('*'),
    listPublicServices(),
  ])
  const guardadas = new Map<string, FilaBD>(
    ((filasBD ?? []) as unknown as FilaBD[]).map((f) => [f.slug, f])
  )
  const delCatalogo = agruparPorDestino(servicios)

  const filas: DestinoFila[] = delCatalogo.map((d) => {
    const g = guardadas.get(d.slug)
    return {
      slug: d.slug,
      nombre: g?.nombre ?? d.ciudad,
      estado: g?.estado ?? d.estado,
      pais: g?.pais ?? 'México',
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      ubicacion: g?.ubicacion ?? '',
      como_llegar: g?.como_llegar ?? '',
      por_que: g?.por_que ?? '',
      cuando_ir: g?.cuando_ir ?? '',
      que_visitar: g?.que_visitar ?? [],
      publicado: g?.publicado ?? false,
      huerfano: false,
      viajes: d.servicios.length,
    }
  })

  // Filas guardadas cuyo destino ya no tiene viajes publicados.
  for (const [slug, g] of guardadas) {
    if (filas.some((f) => f.slug === slug)) continue
    filas.push({
      slug,
      nombre: g.nombre,
      estado: g.estado,
      pais: g.pais,
      lat: g.lat,
      lng: g.lng,
      ubicacion: g.ubicacion ?? '',
      como_llegar: g.como_llegar ?? '',
      por_que: g.por_que ?? '',
      cuando_ir: g.cuando_ir ?? '',
      que_visitar: g.que_visitar ?? [],
      publicado: g.publicado,
      huerfano: true,
      viajes: 0,
    })
  }

  const sinContenido = filas.filter((f) => !f.publicado).length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Destinos"
        description="El texto que ve el visitante en cada página de destino. La lista sale sola del catálogo publicado; aquí solo se llena el contenido."
      />

      {filas.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          No hay destinos todavía: publica un viaje con ciudad de destino y aparece aquí.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filas.length === 1 ? '1 destino' : `${filas.length} destinos`}
            {sinContenido > 0 && ` · ${sinContenido} sin publicar`}
          </p>

          {filas.map((f) => (
            <Card key={f.slug}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{f.nombre}</CardTitle>
                  {f.publicado ? (
                    <Badge variant="secondary">Publicado</Badge>
                  ) : (
                    <Badge variant="outline">Borrador</Badge>
                  )}
                  {f.huerfano && <Badge variant="destructive">Sin viajes</Badge>}
                </div>
                <CardDescription className="flex flex-wrap items-center gap-x-3">
                  <span>/viajes/{f.slug}</span>
                  <span>
                    {f.viajes === 1 ? '1 viaje' : `${f.viajes} viajes`} en el catálogo
                  </span>
                  {!f.huerfano && (
                    <Link
                      href={`/viajes/${f.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
                    >
                      Ver página <ExternalLinkIcon className="size-3" />
                    </Link>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DestinoForm inicial={f} />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
