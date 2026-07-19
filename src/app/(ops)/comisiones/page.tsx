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

  const [agenciasRes, summaryRes] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, commission_rate')
      .eq('supplier_type', 'agency')
      .order('name'),
    supabase.rpc('commissions_summary'),
  ])

  const agencias = agenciasRes.data ?? []
  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as CommissionsSummary
  const lista = d.lista ?? []

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
