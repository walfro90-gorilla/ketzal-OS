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
import { ComisionesList, type ComisionVenta } from './comisiones-list'
import {
  ReglasServicio,
  ReglasEmbajador,
  type ReglaServicio,
  type Embajador,
  type ServicioBasico,
  type ReglaEmbajadorRow,
} from './reglas-servicio'
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

function pluralRevendidas(n: number): string {
  return n === 1 ? '1 venta revendida' : `${n} ventas revendidas`
}

export default async function ComisionesPage() {
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
    .select('role')
    .eq('id', user.id)
    .single()
  const isSuperadmin = profile?.role === 'superadmin'

  const [
    agenciasRes,
    summaryRes,
    settingsRes,
    serviciosRes,
    reglasRes,
    embajadoresRes,
    reglasEmbRes,
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
      ? supabase
          .from('suppliers')
          .select('id, name, referral_code')
          .eq('supplier_type', 'embajador')
          .order('name')
      : Promise.resolve({ data: [], error: null }),
    isSuperadmin
      ? supabase
          .from('commission_rules' as never)
          .select('service_id, scope_supplier_id, basis, rate, unit_amount')
          .eq('payee_type', 'embajador')
          .eq('active', true)
      : Promise.resolve({ data: [], error: null }),
  ])

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

  const reglasEmbajador: ReglaEmbajadorRow[] = (
    (reglasEmbRes.data ?? []) as unknown as {
      service_id: string
      scope_supplier_id: string
      basis: 'percent' | 'fijo_venta' | 'fijo_pax'
      rate: number | null
      unit_amount: number | null
    }[]
  ).map((r) => ({
    embajadorId: r.scope_supplier_id,
    serviceId: r.service_id,
    basis: r.basis,
    value: r.basis === 'percent' ? Number(r.rate) : Number(r.unit_amount),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="Lo que ganas por revender viajes de otras agencias."
      />

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

      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle>Tarifas de embajador</CardTitle>
            <CardDescription>
              Cuánto cobra cada embajador por vender un servicio (Ketzal lo paga de
              su corte). Elige un embajador y fija su tarifa por servicio: fijo por
              pasajero, fijo por venta o % de la venta.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            <p className="text-xs text-muted-foreground">
              {pluralRevendidas(d.num ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comisiones ganadas</CardTitle>
          <CardDescription>
            Ventas donde el servicio pertenece a otra agencia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComisionesList
            rows={lista}
            empty={
              <EmptyState
                icon={PercentIcon}
                title="Aún no has revendido viajes de otra agencia"
                description="Cuando vendas un servicio cuyo dueño es otra agencia, la comisión aparece aquí."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
