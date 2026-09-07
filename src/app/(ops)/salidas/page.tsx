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

/** null = el usuario no tiene agencia (superadmin suelto): no hay qué mostrar. */
async function cargarHuecos(supabase: Cliente): Promise<HuecoVista[] | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase
    .from('profiles')
    .select('supplier_id')
    .eq('id', user.id)
    .maybeSingle()
  const supplierId = perfil?.supplier_id
  if (!supplierId) return null

  const hoy = hoyEn()
  const [svcRes, agRes, opRes, salRes] = await Promise.all([
    supabase
      .from('services')
      .select('id,name,duration_days,meses_ideales')
      .eq('supplier_id', supplierId),
    supabase.from('suppliers').select('alcances_temporada').eq('id', supplierId).maybeSingle(),
    supabase
      .from('oportunidades_fecha' as never)
      .select('clave,anio,descartada_at,texto_ia')
      .eq('supplier_id', supplierId),
    supabase
      .from('service_departures')
      .select('service_id,departs_on,services!inner(supplier_id)')
      .eq('services.supplier_id', supplierId)
      .gte('departs_on', hoy),
  ])

  const servicios = (svcRes.data ?? []) as unknown as ServicioParaHuecos[]
  const alcances =
    ((agRes.data as { alcances_temporada?: Alcance[] | null } | null)?.alcances_temporada ??
      ['nacional']) as Alcance[]
  const filas = (opRes.data ?? []) as unknown as {
    clave: string
    anio: number
    descartada_at: string | null
    texto_ia: string | null
  }[]
  const salidas = ((salRes.data ?? []) as unknown as { service_id: string; departs_on: string }[]).map(
    (s) => ({ service_id: s.service_id, departs_on: s.departs_on })
  )
  const nombre = new Map(servicios.map((s) => [s.id, s.name]))
  const textoPor = new Map(filas.map((f) => [`${f.clave}:${f.anio}`, f.texto_ia]))

  return oportunidades({
    hoy,
    alcances,
    servicios,
    salidas,
    descartadas: filas.filter((f) => f.descartada_at).map((f) => `${f.clave}:${f.anio}`),
  }).map((o) => ({
    ...o,
    cubiertaNombres: o.cubiertaPor.map((id) => nombre.get(id) ?? 'servicio'),
    textoIa: textoPor.get(o.id) ?? null,
  }))
}
