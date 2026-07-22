import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { mxn } from '@/components/data/format'

// F5: conversión (cotización→venta) + meta del mes. Datos de conversion_summary
// y goals_progress (RPCs nuevos, independientes de reports_summary).

export type Conversion = {
  cotizadas: number
  convertidas: number
  tasa: number
  por_agente: { agente: string; cotizadas: number; convertidas: number; tasa: number }[]
}

export type GoalsProgress = {
  month: string
  agencia: { goal: number; vendido: number }
  agentes: {
    agent_id: string
    agente: string
    goal: number
    vendido: number
    avance: number | null
  }[]
}

const pct = (n: number) => `${n}%`

const convColumns: DataColumn<Conversion['por_agente'][number]>[] = [
  { header: 'Agente', primary: true, cell: (r) => r.agente },
  {
    header: 'Cotizadas',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.cotizadas}</span>,
  },
  {
    header: 'Convertidas',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.convertidas}</span>,
  },
  {
    header: 'Tasa',
    align: 'right',
    cell: (r) => <span className="font-semibold tabular-nums">{pct(r.tasa)}</span>,
  },
]

export function ConversionCard({ conv }: { conv: Conversion }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversión (cotización → venta)</CardTitle>
        <CardDescription>
          Cuántas cotizaciones del periodo se volvieron venta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Cotizadas</p>
            <p className="text-lg font-bold tabular-nums">{conv.cotizadas}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Convertidas</p>
            <p className="text-lg font-bold tabular-nums">{conv.convertidas}</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Tasa de conversión</p>
            <p className="text-lg font-bold tabular-nums text-primary">{pct(conv.tasa)}</p>
          </div>
        </div>
        <DataList
          columns={convColumns}
          rows={conv.por_agente}
          getRowKey={(r) => r.agente}
          empty={
            <p className="text-sm text-muted-foreground">
              Sin cotizaciones con folio en el periodo.
            </p>
          }
        />
      </CardContent>
    </Card>
  )
}

export function MetaMesCard({ goals }: { goals: GoalsProgress }) {
  const goal = Number(goals.agencia?.goal ?? 0)
  const vendido = Number(goals.agencia?.vendido ?? 0)
  const avance = goal > 0 ? Math.round((vendido / goal) * 1000) / 10 : null
  const cumplida = avance != null && avance >= 100

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta del mes</CardTitle>
        <CardDescription>
          Meta de la agencia vs. lo vendido en {goals.month}. Las metas se fijan
          en Equipo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {goal > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Vendido</p>
                <p className="text-2xl font-bold tabular-nums">{mxn.format(vendido)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Meta</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {mxn.format(goal)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${cumplida ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, avance ?? 0)}%` }}
                />
              </div>
              <p
                className={`text-right text-sm font-semibold tabular-nums ${
                  cumplida ? 'text-emerald-700 dark:text-emerald-400' : ''
                }`}
              >
                {avance}% {cumplida ? '· meta cumplida' : ''}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no hay meta de agencia para {goals.month}. Fíjala en Equipo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
