import { CircleCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { PageHeader } from '@/components/data/page-header'
import { getSalud, type SaludEvento } from './data'

const dtf = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' })

function levelBadge(level: SaludEvento['level']) {
  if (level === 'critical' || level === 'error')
    return <Badge variant="destructive">{level}</Badge>
  if (level === 'warn')
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 text-amber-700 dark:text-amber-400"
      >
        {level}
      </Badge>
    )
  return <Badge variant="secondary">{level}</Badge>
}

// Los eventos no traen id: la clave estable es su posición en la lista.
type EventoRow = SaludEvento & { key: string }

// El evento es la columna primaria: en móvil encabeza la tarjeta y el resto
// (fecha, origen, nivel) baja como pares etiqueta/valor sin scroll horizontal.
const eventoColumns: DataColumn<EventoRow>[] = [
  {
    header: 'Fecha',
    cell: (ev) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {dtf.format(new Date(ev.ts))}
      </span>
    ),
  },
  {
    header: 'Origen',
    cell: (ev) => <span className="font-mono text-xs">{ev.source}</span>,
  },
  { header: 'Nivel', cell: (ev) => levelBadge(ev.level) },
  { header: 'Evento', primary: true, cell: (ev) => ev.event },
]

export default async function SaludPage() {
  const data = await getSalud()

  if (!data) {
    return (
      <PageHeader
        title="Salud del sistema"
        description="Solo el superadmin puede ver la salud del sistema."
      />
    )
  }

  const inv = data.invariantes
  const ok = (inv?.violaciones ?? 0) === 0
  const eventos: EventoRow[] = data.eventos.map((ev, i) => ({
    ...ev,
    key: String(i),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salud del sistema"
        description="Invariantes de dinero y eventos recientes (cron, webhook). El cron corre este chequeo a diario."
      />

      {/* Invariantes de dinero */}
      <Card
        className={ok ? undefined : 'bg-destructive/5 ring-destructive/30'}
      >
        <CardHeader>
          <CardDescription
            className={cn('flex items-center gap-1.5', !ok && 'text-destructive')}
          >
            {ok ? (
              <CircleCheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
            ) : (
              <TriangleAlertIcon className="size-3.5 shrink-0" />
            )}
            Invariantes de dinero
          </CardDescription>
          <CardTitle
            className={cn('text-2xl', ok ? 'text-foreground' : 'text-destructive')}
          >
            {ok ? 'Todo cuadra' : `${inv.violaciones} violación(es)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ok ? (
            <p className="text-xs text-muted-foreground">
              Cada venta cuadra (total = subtotal − descuento), las líneas suman,
              los planes de pago suman al total y cada recibo cuadra con su pago.
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-destructive">
              {inv.detalle.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.check}</span> ·{' '}
                  <span className="font-mono text-xs">{d.booking_id.slice(0, 8)}</span>{' '}
                  — {d.detalle}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Eventos del sistema */}
      <Card>
        <CardHeader>
          <CardTitle>Eventos recientes</CardTitle>
          <CardDescription>
            Últimos 50 eventos de Clawbot (cron) y del webhook de Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataList
            columns={eventoColumns}
            rows={eventos}
            getRowKey={(ev) => ev.key}
            empty={
              <p className="text-sm text-muted-foreground">
                Aún no hay eventos. Aparecerán cuando corra el cron o llegue un pago.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
