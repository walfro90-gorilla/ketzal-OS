import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { PageHeader } from '@/components/data/page-header'
import { mxn } from '@/components/data/format'
import { RangoFechas } from './rango-fechas'
import { ExportarCsv } from './exportar-csv'
import { BarrasTop, GraficaMensual } from './graficas'
// Tipos del jsonb de ketzal.reports_summary(p_from, p_to): ver ./tipos.ts.
import type { PorAgente, PorMes, PorServicio, Reporte } from './tipos'

const EMPTY_REPORTE: Reporte = {
  total_vendido: 0,
  total_cobrado: 0,
  saldo_por_cobrar: 0,
  total_comision: 0,
  num_ventas: 0,
  ticket_promedio: 0,
  por_agente: [],
  por_servicio: [],
  por_mes: [],
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha local → "YYYY-MM-DD" sin corrimiento por zona horaria. */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const mesFormatter = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  year: 'numeric',
})

/** "2026-07" → "jul 2026" (mediodía para evitar corrimiento por zona horaria). */
function formatMes(mes: string): string {
  const parsed = new Date(`${mes}-01T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return mes
  return mesFormatter.format(parsed)
}

function pluralVentas(n: number): string {
  return n === 1 ? '1 venta' : `${n} ventas`
}

const agenteColumns: DataColumn<PorAgente>[] = [
  { header: 'Agente', primary: true, cell: (r) => r.agente },
  {
    header: '# Ventas',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.num}</span>,
  },
  {
    header: 'Vendido',
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">{mxn.format(Number(r.vendido))}</span>
    ),
  },
  {
    header: 'Comisión',
    align: 'right',
    cell: (r) => (
      <span className="font-semibold tabular-nums">
        {mxn.format(Number(r.comision))}
      </span>
    ),
  },
]

const servicioColumns: DataColumn<PorServicio>[] = [
  { header: 'Servicio', primary: true, cell: (r) => r.servicio },
  {
    header: '# Ventas',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.num}</span>,
  },
  {
    header: 'Vendido',
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">{mxn.format(Number(r.vendido))}</span>
    ),
  },
]

const mesColumns: DataColumn<PorMes>[] = [
  { header: 'Mes', primary: true, cell: (r) => formatMes(r.mes) },
  {
    header: '# Ventas',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.num}</span>,
  },
  {
    header: 'Vendido',
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">{mxn.format(Number(r.vendido))}</span>
    ),
  },
]

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const hoy = new Date()
  const defaultFrom = isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const defaultTo = isoDate(hoy)

  const rawFrom = typeof params.from === 'string' ? params.from : undefined
  const rawTo = typeof params.to === 'string' ? params.to : undefined
  const from = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : defaultFrom
  const to = rawTo && DATE_RE.test(rawTo) ? rawTo : defaultTo

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const summaryRes = await supabase.rpc('reports_summary', {
    p_from: from,
    p_to: to,
  })

  const d = (summaryRes.data ?? EMPTY_REPORTE) as unknown as Reporte
  const porAgente = d.por_agente ?? []
  const porServicio = d.por_servicio ?? []
  const porMes = d.por_mes ?? []
  const saldoPorCobrar = Number(d.saldo_por_cobrar ?? 0)
  const hayPorCobrar = saldoPorCobrar > 0

  const emptyState = (
    <p className="text-sm text-muted-foreground">Sin ventas en el periodo.</p>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Ventas y comisiones por periodo."
        action={<ExportarCsv reporte={d} from={from} to={to} />}
      />

      <RangoFechas key={`${from}|${to}`} from={from} to={to} />

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el reporte: {summaryRes.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader>
            <CardDescription>Vendido</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_vendido ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pluralVentas(d.num_ventas ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Cobrado</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_cobrado ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Pagos registrados</p>
          </CardContent>
        </Card>

        <Card
          className={
            hayPorCobrar ? 'border-amber-500/50 bg-amber-500/5' : undefined
          }
        >
          <CardHeader>
            <CardDescription
              className={
                hayPorCobrar ? 'text-amber-700 dark:text-amber-400' : undefined
              }
            >
              Por cobrar
            </CardDescription>
            <CardTitle
              className={`text-2xl tabular-nums${
                hayPorCobrar ? ' text-amber-700 dark:text-amber-400' : ''
              }`}
            >
              {mxn.format(saldoPorCobrar)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xs ${
                hayPorCobrar
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-muted-foreground'
              }`}
            >
              Saldo pendiente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Comisión</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.total_comision ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Por reventas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ventas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {d.num_ventas ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">En el periodo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ticket promedio</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(d.ticket_promedio ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Vendido por venta</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por agente</CardTitle>
            <CardDescription>
              Lo vendido y la comisión de cada agente en el periodo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <BarrasTop
              items={porAgente.map((r) => ({
                clave: r.agente,
                etiqueta: r.agente,
                valor: Number(r.vendido),
                detalle: `${r.agente} · ${mxn.format(Number(r.vendido))} · ${pluralVentas(
                  Number(r.num),
                )} · comisión ${mxn.format(Number(r.comision))}`,
              }))}
            />
            <DataList
              columns={agenteColumns}
              rows={porAgente}
              getRowKey={(r) => r.agente}
              empty={emptyState}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventas por servicio</CardTitle>
            <CardDescription>
              Los servicios más vendidos en el periodo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <BarrasTop
              items={porServicio.map((r) => ({
                clave: r.servicio,
                etiqueta: r.servicio,
                valor: Number(r.vendido),
                detalle: `${r.servicio} · ${mxn.format(Number(r.vendido))} · ${pluralVentas(
                  Number(r.num),
                )}`,
              }))}
            />
            <DataList
              columns={servicioColumns}
              rows={porServicio}
              getRowKey={(r) => r.servicio}
              empty={emptyState}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas por mes</CardTitle>
          <CardDescription>
            Evolución mensual dentro del periodo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <GraficaMensual data={porMes} />
          <DataList
            columns={mesColumns}
            rows={porMes}
            getRowKey={(r) => r.mes}
            empty={emptyState}
          />
        </CardContent>
      </Card>
    </div>
  )
}
