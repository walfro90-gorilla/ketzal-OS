import { PercentIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { mxn } from '@/components/data/format'
import { TasaForm } from './tasa-form'
import { CrearEmbajador } from './embajador-crear'
import { ReferidosFallidos, type ReferidoFallido } from './referidos-fallidos'
import { EmbajadoresAccesos } from './embajadores-accesos'
import { ComisionesList, type ComisionVenta } from './comisiones-list'
import {
  ReglasServicio,
  ReglasEmbajador,
  TarifaEmbajadoresAgencia,
  type ReglaServicio,
  type Embajador,
  type ServicioBasico,
  type ReglaEmbajadorRow,
  type TarifaAgenciaRow,
} from './reglas-servicio'
import { ReglasAgente, type AgenteComision } from './reglas-agente'
import { CorteEmbajadores, type FilaCorte } from './corte'
import { finDelCorte } from '@/lib/domain/embajador'
import type { ReglaBasis } from './reglas-actions'

type CommissionsSummary = {
  total_comision: number
  num: number
  lista: ComisionVenta[]
}

const EMPTY_SUMMARY: CommissionsSummary = {
  total_comision: 0,
  num: 0,
  lista: [],
}

export default async function ComisionesPage({
  searchParams,
}: {
  /** `?corte=YYYY-MM-DD` para mirar un corte distinto al de la quincena actual. */
  searchParams: Promise<{ corte?: string | string[] }>
}) {
  const { corte: corteRaw } = await searchParams
  const cortePedido = Array.isArray(corteRaw) ? corteRaw[0] : corteRaw
  // Por default, el fin de la quincena en curso (día 15 o último del mes).
  const hastaCorte =
    cortePedido && /^\d{4}-\d{2}-\d{2}$/.test(cortePedido)
      ? cortePedido
      : finDelCorte(new Date())
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  // Solo el superadmin configura "cuánto gana Ketzal por servicio" (regla de
  // plataforma). Un admin de agencia no ve ni edita el corte de la plataforma.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, supplier_id')
    .eq('id', user.id)
    .single()
  const isSuperadmin = profile?.role === 'superadmin'
  const isAdmin = profile?.role === 'admin'

  const [
    agenciasRes,
    summaryRes,
    settingsRes,
    serviciosRes,
    reglasRes,
    embajadoresRes,
    reglasEmbRes,
    agentesRes,
    corteRes,
  ] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, commission_rate')
      .eq('supplier_type', 'agency')
      .order('name'),
    supabase.rpc('commissions_summary'),
    isSuperadmin
      ? supabase
          .from('app_settings')
          .select('platform_commission_rate')
          .eq('id', 1)
          .single()
      : Promise.resolve({ data: null, error: null }),
    isSuperadmin
      ? supabase.from('services').select('id, name, supplier_id').order('name')
      : Promise.resolve({ data: [], error: null }),
    isSuperadmin
      ? supabase
          .from('commission_rules' as never)
          .select('service_id, basis, rate, unit_amount')
          .eq('payee_type', 'plataforma')
          .eq('active', true)
      : Promise.resolve({ data: [], error: null }),
    isSuperadmin
      ? // Embajadores viven en profiles (type='embajador', F2); RLS solo-propio ⇒
        // se leen vía RPC DEFINER. Devuelve [{id,name,referral_code}].
        supabase.rpc('list_ambassadors' as never)
      : Promise.resolve({ data: [], error: null }),
    // b080: se trae también `scope_supplier_id` — la tarifa GENERAL de la agencia,
    // que es la que de verdad paga (m008). El admin de agencia también la lee:
    // la RLS de commission_rules ya lo acota a lo suyo.
    isSuperadmin || isAdmin
      ? supabase
          .from('commission_rules' as never)
          .select('service_id, scope_profile_id, scope_supplier_id, basis, rate, unit_amount')
          .eq('payee_type', 'embajador')
          .eq('active', true)
      : Promise.resolve({ data: [], error: null }),
    isAdmin ? supabase.rpc('list_agents_for_commission' as never) : Promise.resolve({ data: [], error: null }),
    // Corte de comisiones a la fecha (b086). El RPC ya acota: el superadmin ve
    // todo, un admin de agencia solo lo que SU agencia debe.
    isSuperadmin || isAdmin
      ? supabase.rpc('corte_embajadores' as never, { p_hasta: hastaCorte } as never)
      : Promise.resolve({ data: null, error: null }),
  ])

  const corte = (corteRes?.data ?? { total_a_pagar: 0, filas: [] }) as unknown as {
    total_a_pagar: number
    filas: FilaCorte[]
  }

  const agencias = agenciasRes.data ?? []
  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as CommissionsSummary
  const lista = d.lista ?? []

  // Reglas de plataforma por servicio (solo superadmin): cruza el catálogo con
  // las reglas activas; sin regla ⇒ 'global' (usa el % de app_settings).
  const globalRate = Number(
    (settingsRes.data as { platform_commission_rate?: number } | null)
      ?.platform_commission_rate ?? 0
  )
  const agenciaPorId = new Map(
    (agencias as { id: string; name: string }[]).map((a) => [a.id, a.name])
  )
  // El superadmin no tiene agencia propia: al dar de alta un embajador tiene que
  // decir de quién es, o quedaría huérfano y sin tarifa posible (m005).
  const agenciasParaAlta = (agencias as { id: string; name: string }[]).map((a) => ({
    id: a.id,
    name: a.name,
  }))

  // Referidos que no generaron comisión (m008). La RLS de `referral_misses` ya
  // acota: el superadmin ve todo, el admin solo los de su agencia. Se traen los
  // 50 más recientes — es una bandeja de revisión, no un histórico.
  const { data: missesRaw } =
    isSuperadmin || isAdmin
      ? await supabase
          .from('referral_misses' as never)
          .select('id, ref_code, reason, created_at, bookings(folio, total)')
          .order('created_at', { ascending: false })
          .limit(50)
      : { data: null }

  const referidosFallidos: ReferidoFallido[] = (
    (missesRaw ?? []) as unknown as {
      id: string
      ref_code: string
      reason: string
      created_at: string
      bookings: { folio: string | null; total: number | null } | null
    }[]
  ).map((m) => ({
    id: m.id,
    ref_code: m.ref_code,
    reason: m.reason,
    created_at: m.created_at,
    folio: m.bookings?.folio ?? null,
    total: m.bookings?.total ?? null,
  }))
  const reglaPorServicio = new Map(
    (
      (reglasRes.data ?? []) as unknown as {
        service_id: string
        basis: 'percent' | 'fijo_venta' | 'fijo_pax'
        rate: number | null
        unit_amount: number | null
      }[]
    ).map((r) => [r.service_id, r])
  )
  const reglasServicio: ReglaServicio[] = (
    (serviciosRes.data ?? []) as unknown as {
      id: string
      name: string
      supplier_id: string
    }[]
  ).map((s) => {
    const r = reglaPorServicio.get(s.id)
    const basis: ReglaBasis = r ? r.basis : 'global'
    return {
      serviceId: s.id,
      nombre: s.name,
      agencia: agenciaPorId.get(s.supplier_id) ?? null,
      basis,
      value: r ? (r.basis === 'percent' ? Number(r.rate) : Number(r.unit_amount)) : null,
    }
  })

  // Tarifas de embajador por servicio (solo superadmin): embajadores + catálogo
  // básico + reglas activas de payee_type='embajador' (scope = el embajador).
  const embajadores: Embajador[] = (
    (embajadoresRes.data ?? []) as unknown as {
      id: string
      name: string
      referral_code: string | null
    }[]
  ).map((e) => ({ id: e.id, nombre: e.name, codigo: e.referral_code }))

  const serviciosBasicos: ServicioBasico[] = (
    (serviciosRes.data ?? []) as unknown as {
      id: string
      name: string
      supplier_id: string
    }[]
  ).map((s) => ({
    id: s.id,
    nombre: s.name,
    agencia: agenciaPorId.get(s.supplier_id) ?? null,
  }))

  // Tarifa de agentes (solo admin de agencia, b054): una por agente, no por
  // servicio — el RPC ya trae la tarifa vigente (LEFT JOIN, RLS de
  // commission_rules no deja leer payee_type='agente' directo).
  const agentesComision: AgenteComision[] = (
    (agentesRes.data ?? []) as unknown as {
      id: string
      name: string
      basis: string | null
      rate: number | null
      unit_amount: number | null
      referral_code: string | null
    }[]
  ).map((a) => ({
    id: a.id,
    nombre: a.name,
    pct: a.basis === 'hibrido' ? Number(a.rate) : null,
    porPasajero: a.basis === 'hibrido' ? Number(a.unit_amount) : null,
    codigo: a.referral_code, // m010
  }))

  type ReglaEmbRaw = {
    service_id: string | null
    scope_profile_id: string | null
    scope_supplier_id: string | null
    basis: 'percent' | 'fijo_venta' | 'fijo_pax' | 'hibrido'
    rate: number | null
    unit_amount: number | null
  }
  const reglasEmbRaw = (reglasEmbRes.data ?? []) as unknown as ReglaEmbRaw[]

  // Tarifa general por agencia (m008): sin servicio y con scope de agencia.
  const porAgencia = new Map(
    reglasEmbRaw
      .filter((r) => r.scope_supplier_id && !r.service_id)
      .map((r) => [r.scope_supplier_id as string, r]),
  )
  const tarifasAgencia: TarifaAgenciaRow[] = (
    agencias as { id: string; name: string }[]
  )
    .filter((a) => isSuperadmin || a.id === profile?.supplier_id)
    .map((a) => {
      const r = porAgencia.get(a.id)
      // 'hibrido' guarda los dos: rate (%) y unit_amount ($/pax).
      return {
        supplierId: a.id,
        nombre: a.name,
        basis: (r?.basis ?? 'global') as ReglaBasis,
        value: r
          ? r.basis === 'percent' || r.basis === 'hibrido'
            ? Number(r.rate)
            : Number(r.unit_amount)
          : null,
        value2: r?.basis === 'hibrido' ? Number(r.unit_amount) : null,
      }
    })

  const reglasEmbajador: ReglaEmbajadorRow[] = reglasEmbRaw
    .filter((r) => r.scope_profile_id && r.service_id)
    .map((r) => ({
    embajadorId: r.scope_profile_id as string,
    serviceId: r.service_id as string,
    basis: r.basis,
    value: r.basis === 'percent' ? Number(r.rate) : Number(r.unit_amount),
  }))

  // El superadmin ve el CORTE DE PLATAFORMA (libres + marketplace); una agencia
  // ve sus comisiones de REVENTA. Los textos se adaptan al rol.
  const L = isSuperadmin
    ? {
        pageDesc: 'El corte de Ketzal por las ventas del marketplace.',
        cardTitle: 'Corte de plataforma',
        cardDesc: 'Ventas del portal público donde Ketzal cobra su corte. Lo que vendes desde el back-office no paga corte.',
        emptyTitle: 'Aún no hay ventas con corte de plataforma',
        emptyDesc: 'Cuando un agente libre o el marketplace concreten una venta, el corte de Ketzal aparece aquí.',
        count: (n: number) => (n === 1 ? '1 venta' : `${n} ventas`),
      }
    : {
        pageDesc: 'Lo que ganas por revender viajes de otras agencias.',
        cardTitle: 'Comisiones ganadas',
        cardDesc: 'Ventas donde el servicio pertenece a otra agencia.',
        emptyTitle: 'Aún no has revendido viajes de otra agencia',
        emptyDesc: 'Cuando vendas un servicio cuyo dueño es otra agencia, la comisión aparece aquí.',
        count: (n: number) => (n === 1 ? '1 venta revendida' : `${n} ventas revendidas`),
      }

  return (
    <div className="space-y-6">
      <PageHeader title="Comisiones" description={L.pageDesc} />

      <Card>
        <CardHeader>
          <CardTitle>Configuración de porcentajes</CardTitle>
          <CardDescription>
            El % que cada agencia te paga cuando revendes sus viajes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agenciasRes.error ? (
            <p className="text-sm text-destructive">
              Error al cargar las agencias: {agenciasRes.error.message}
            </p>
          ) : agencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay agencias registradas.
            </p>
          ) : (
            <ul className="divide-y">
              {agencias.map((agencia) => (
                <li
                  key={agencia.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium">{agencia.name}</span>
                  <TasaForm
                    supplierId={agencia.id}
                    initialRate={Number(agencia.commission_rate ?? 0)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle>Ganancia de Ketzal por servicio</CardTitle>
            <CardDescription>
              Cuánto gana Ketzal al vender cada servicio. Por defecto usa el %
              global ({globalRate}%); aquí puedes ponerle un % propio o un monto
              fijo (por venta o por pasajero) cuando el trato sea distinto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reglasRes.error ? (
              <p className="text-sm text-destructive">
                Error al cargar las reglas: {reglasRes.error.message}
              </p>
            ) : (
              <ReglasServicio
                reglas={reglasServicio}
                globalRate={globalRate}
                showAgencia
              />
            )}
          </CardContent>
        </Card>
      )}

      {(isSuperadmin || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>Embajadores</CardTitle>
            <CardDescription>
              Da de alta a quien va a compartir tus viajes y fija cuánto gana: fijo
              por pasajero, fijo por venta, % de la venta, o una mezcla. Cualquier
              embajador puede traer ventas de cualquier agencia, y{' '}
              <strong>paga la agencia dueña del viaje con la tarifa que ella fijó</strong>
              {isSuperadmin ? ' (la tuya cubre los viajes de plataforma).' : '.'}{' '}
              Sin tarifa configurada el embajador no cobra nada, aunque traiga
              ventas — y esas ventas aparecen abajo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrearEmbajador
                agencias={isSuperadmin ? agenciasParaAlta : undefined}
                embajadores={embajadores.map((e) => ({ id: e.id, nombre: e.nombre }))}
              />
            {embajadoresRes.error ? (
              <p className="text-sm text-destructive">
                Error al cargar los embajadores: {embajadoresRes.error.message}
              </p>
            ) : (
              <ReglasEmbajador
                embajadores={embajadores}
                servicios={serviciosBasicos}
                reglas={reglasEmbajador}
              />
            )}
            <EmbajadoresAccesos embajadores={embajadores} />
          </CardContent>
        </Card>
      )}

      {(isSuperadmin || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>Corte de comisiones</CardTitle>
            <CardDescription>
              A quién le debes hoy y cuánto. Cierra el <strong>día 15</strong> y el
              <strong> último del mes</strong>, pero es acumulativo: si te saltas
              una quincena, la siguiente trae lo pendiente. Solo aparece lo de
              ventas con dinero ya cobrado — si el cliente no ha pagado o le
              devolviste, no hay de dónde pagar la comisión.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {corteRes?.error ? (
              <p className="text-sm text-destructive">
                Error al cargar el corte: {corteRes.error.message}
              </p>
            ) : (
              <CorteEmbajadores
                filas={corte.filas ?? []}
                hasta={hastaCorte}
                totalAPagar={Number(corte.total_a_pagar ?? 0)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {(isSuperadmin || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle>Embajadores: cuánto paga tu agencia</CardTitle>
            <CardDescription>
              Lo que ganas cuando alguien te trae un viajero con su link. Paga la
              agencia dueña del viaje, con la tarifa que ella fije aquí (no la de
              quien lo reclutó). <strong>Sin tarifa el embajador no cobra nada</strong>,
              aunque traiga la venta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reglasEmbRes.error ? (
              <p className="text-sm text-destructive">
                Error al cargar las tarifas: {reglasEmbRes.error.message}
              </p>
            ) : (
              <TarifaEmbajadoresAgencia agencias={tarifasAgencia} />
            )}
          </CardContent>
        </Card>
      )}

      {(isSuperadmin || isAdmin) && <ReferidosFallidos filas={referidosFallidos} />}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Agentes: tarifa y código de referido</CardTitle>
            <CardDescription>
              Cuánto le pagas a cada agente de tu equipo por cerrar una venta
              (de tu margen, no del corte de Ketzal): % de la venta + monto fijo
              por pasajero, los dos a la vez. Y dale su código de referido si
              además comparte viajes — esas ventas le pagan con la tarifa de
              embajadores, no con esta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {agentesRes.error ? (
              <p className="text-sm text-destructive">
                Error al cargar los agentes: {agentesRes.error.message}
              </p>
            ) : (
              <ReglasAgente agentes={agentesComision} />
            )}
          </CardContent>
        </Card>
      )}

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las comisiones: {summaryRes.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total comisiones</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_comision ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{L.count(d.num ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{L.cardTitle}</CardTitle>
          <CardDescription>{L.cardDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ComisionesList
            rows={lista}
            empty={
              <EmptyState
                icon={PercentIcon}
                title={L.emptyTitle}
                description={L.emptyDesc}
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
