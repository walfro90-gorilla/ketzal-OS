import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { MapPinnedIcon } from 'lucide-react'
import { SalidasList } from './salidas-list'
import { HuecosList, type HuecoVista } from './huecos-list'
import type { Salida } from './tipos'
import {
  HORIZONTE_DIAS,
  hoyEn,
  oportunidades,
  type ServicioParaHuecos,
} from '@/lib/domain/oportunidades'
import type { Alcance } from '@/lib/domain/temporadas-mx'

export default async function SalidasPage() {
  const supabase = await createClient()
  const [{ data }, huecos] = await Promise.all([
    supabase.rpc('list_departures' as never),
    cargarHuecos(supabase),
  ])
  const salidas = (data ?? []) as unknown as Salida[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salidas"
        description="Las salidas que opera tu agencia: ocupación y captura de pasajeros."
      />
      <Card>
        <CardContent className="pt-6">
          <SalidasList
            rows={salidas}
            empty={
              <EmptyState
                icon={MapPinnedIcon}
                title="No hay salidas próximas"
                description="Las salidas se dan de alta en el servicio (con su cupo). Aquí verás las de los servicios que opera tu agencia."
              />
            }
          />
        </CardContent>
      </Card>

      {/* ADR-0058: temporadas fijas − salidas = huecos. Sección con ancla en
          vez de pestaña: la campana enlaza a /salidas#huecos y una pestaña
          escondería la lista de salidas detrás de un clic. */}
      {huecos && (
        <Card id="huecos">
          <CardHeader>
            <CardTitle>Huecos en el calendario</CardTitle>
            <CardDescription>
              Puentes, vacaciones y fechas altas de los próximos {HORIZONTE_DIAS} días.
              Las que no tienen salida son ventas que todavía no existen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HuecosList items={huecos} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

type Cliente = Awaited<ReturnType<typeof createClient>>

type Agencia = { id: string; name: string; alcances_temporada: Alcance[] | null }

/**
 * Las agencias cuyos huecos ve esta persona: la suya si tiene; TODAS si es
 * superadmin sin agencia (igual que la lista de salidas de arriba). null = sin
 * sesión o sin nada que mostrar.
 */
async function agenciasVisibles(supabase: Cliente): Promise<Agencia[] | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase
    .from('profiles')
    .select('supplier_id, role')
    .eq('id', user.id)
    .maybeSingle()
  let q = supabase
    .from('suppliers')
    .select('id, name, alcances_temporada')
    .eq('supplier_type', 'agency')
    .order('name')
  if (perfil?.supplier_id) q = q.eq('id', perfil.supplier_id)
  else if (perfil?.role !== 'superadmin') return null
  const { data } = await q
  const lista = (data ?? []) as unknown as Agencia[]
  return lista.length ? lista : null
}

async function cargarHuecos(supabase: Cliente): Promise<HuecoVista[] | null> {
  const agencias = await agenciasVisibles(supabase)
  if (!agencias) return null
  const ids = agencias.map((a) => a.id)

  const hoy = hoyEn()
  // Tres lecturas para todas las agencias visibles; la RLS ya acota lo que cada
  // quien puede ver, así que el filtro por agencia aquí es solo agrupación.
  const [svcRes, opRes, salRes] = await Promise.all([
    supabase
      .from('services')
      .select('id,name,supplier_id,duration_days,meses_ideales')
      .in('supplier_id', ids),
    supabase
      .from('oportunidades_fecha' as never)
      .select('supplier_id,clave,anio,descartada_at,texto_ia')
      .in('supplier_id', ids),
    supabase
      .from('service_departures')
      .select('service_id,departs_on,services!inner(supplier_id)')
      .in('services.supplier_id', ids)
      .gte('departs_on', hoy),
  ])

  const servicios = (svcRes.data ?? []) as unknown as (ServicioParaHuecos & { supplier_id: string })[]
  const filas = (opRes.data ?? []) as unknown as {
    supplier_id: string
    clave: string
    anio: number
    descartada_at: string | null
    texto_ia: string | null
  }[]
  const salidas = (salRes.data ?? []) as unknown as {
    service_id: string
    departs_on: string
    services: { supplier_id: string } | { supplier_id: string }[] | null
  }[]
  const agenciaDeServicio = new Map(servicios.map((s) => [s.id, s.supplier_id]))
  const nombre = new Map(servicios.map((s) => [s.id, s.name]))

  return agencias.flatMap((ag) => {
    const propios = servicios.filter((s) => s.supplier_id === ag.id)
    const misFilas = filas.filter((f) => f.supplier_id === ag.id)
    const textoPor = new Map(misFilas.map((f) => [`${f.clave}:${f.anio}`, f.texto_ia]))
    return oportunidades({
      hoy,
      alcances: ag.alcances_temporada ?? ['nacional'],
      servicios: propios,
      salidas: salidas
        .filter((s) => agenciaDeServicio.get(s.service_id) === ag.id)
        .map((s) => ({ service_id: s.service_id, departs_on: s.departs_on })),
      descartadas: misFilas.filter((f) => f.descartada_at).map((f) => `${f.clave}:${f.anio}`),
    }).map((o) => ({
      ...o,
      supplierId: ag.id,
      agenciaNombre: ag.name,
      cubiertaNombres: o.cubiertaPor.map((id) => nombre.get(id) ?? 'servicio'),
      textoIa: textoPor.get(o.id) ?? null,
    }))
  })
}
