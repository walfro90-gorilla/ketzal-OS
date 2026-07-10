import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  ArrowRightIcon,
  BanknoteIcon,
  BotIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  FileTextIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import {
  formatTravelDate,
  mxn,
  StatusBadge,
  type BookingStatus,
} from '../ventas/ui'
import { getClawbotResumen, type ClawbotResumen } from '../clawbot/data'

// Forma del jsonb que devuelve ketzal.dashboard_summary().
// Los tipos generados a mano declaran `Returns: Json`, así que se
// estrecha aquí con un cast (mismo patrón que en /ventas).
type VentaSaldo = {
  id: string
  cliente: string | null
  servicio: string | null
  total: number
  saldo: number
  status: BookingStatus
  due_date: string | null
  vencida: boolean
}

type ProximoViaje = {
  id: string
  cliente: string | null
  servicio: string | null
  travel_date: string | null
  num_pax: number
  status: BookingStatus
}

type DashboardSummary = {
  por_cobrar: number
  num_por_cobrar: number
  num_cotizaciones: number
  total_vendido: number
  num_ventas: number
  monto_vencido: number
  num_vencidas: number
  ventas_saldo: VentaSaldo[]
  proximos_viajes: ProximoViaje[]
}

const EMPTY_SUMMARY: DashboardSummary = {
  por_cobrar: 0,
  num_por_cobrar: 0,
  num_cotizaciones: 0,
  total_vendido: 0,
  num_ventas: 0,
  monto_vencido: 0,
  num_vencidas: 0,
  ventas_saldo: [],
  proximos_viajes: [],
}

/** Máximo de filas por lista en el panel; el resto vive en /ventas. */
const TOP_N = 5

function pluralVentas(n: number): string {
  return n === 1 ? '1 venta' : `${n} ventas`
}

/** Desglose en una línea del digest de Clawbot: "2 vencidos · 1 por vencer · 1 viaje". */
function clawbotDetalle(r: ClawbotResumen): string {
  const parts: string[] = []
  if (r.abono_vencido > 0)
    parts.push(`${r.abono_vencido} ${r.abono_vencido === 1 ? 'vencido' : 'vencidos'}`)
  if (r.abono_por_vencer > 0) parts.push(`${r.abono_por_vencer} por vencer`)
  if (r.viaje_proximo > 0)
    parts.push(`${r.viaje_proximo} ${r.viaje_proximo === 1 ? 'viaje' : 'viajes'}`)
  if (r.cotizacion_seguimiento > 0)
    parts.push(
      `${r.cotizacion_seguimiento} ${
        r.cotizacion_seguimiento === 1 ? 'cotización' : 'cotizaciones'
      }`
    )
  return parts.join(' · ')
}

// ── KPI ──────────────────────────────────────────────────────────────
// Mismo patrón visual que las tarjetas de /reportes: etiqueta muted,
// cifra 2xl tabular, detalle xs.

function Kpi({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

// ── Requiere atención ────────────────────────────────────────────────
// Tarjetas accionables con dos estados: alerta (tinte semántico + cifra
// tonificada) y "todo al día" (tarjeta neutra con palomita). El enlace a
// la lista completa se muestra siempre.

type AtencionTone = 'danger' | 'pendiente' | 'bot'

const ATENCION_TONES: Record<AtencionTone, { card: string; text: string }> = {
  // Vencido = token destructive del tema.
  danger: {
    card: 'bg-destructive/5 ring-destructive/30',
    text: 'text-destructive',
  },
  // Pendiente = ámbar, la misma convención de /reportes y del badge "Cotización".
  pendiente: {
    card: 'bg-amber-500/5 ring-amber-500/40',
    text: 'text-amber-700 dark:text-amber-400',
  },
  // Clawbot = primario (teal de marca): accionable, no alarmante.
  bot: {
    card: 'bg-primary/5 ring-primary/30',
    text: 'text-primary',
  },
}

function AtencionCard({
  tone,
  icon: Icon,
  label,
  active,
  value,
  detail,
  calmValue = 'Todo al día',
  calmDetail,
  href,
  linkLabel,
}: {
  tone: AtencionTone
  icon: ComponentType<{ className?: string }>
  label: string
  /** true = hay pendientes (alerta); false = "todo al día". */
  active: boolean
  value: string
  detail: string
  /** Título del estado en calma (default "Todo al día"). */
  calmValue?: string
  calmDetail: string
  href: string
  linkLabel: string
}) {
  const t = ATENCION_TONES[tone]
  return (
    <Card className={active ? t.card : undefined}>
      <CardHeader>
        <CardDescription
          className={cn('flex items-center gap-1.5', active && t.text)}
        >
          {active ? (
            <Icon className="size-3.5 shrink-0" />
          ) : (
            <CircleCheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
          )}
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            'text-2xl tabular-nums',
            active ? t.text : 'text-muted-foreground'
          )}
        >
          {active ? value : calmValue}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <p className={cn('text-xs', active ? t.text : 'text-muted-foreground')}>
          {active ? detail : calmDetail}
        </p>
        <Link
          href={href}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:underline',
            active ? t.text : 'text-primary'
          )}
        >
          {linkLabel}
          <ArrowRightIcon className="size-3" />
        </Link>
      </CardContent>
    </Card>
  )
}

// ── Listas ───────────────────────────────────────────────────────────

const porCobrarColumns: DataColumn<VentaSaldo>[] = [
  { header: 'Cliente', primary: true, cell: (v) => v.cliente ?? 'Sin cliente' },
  { header: 'Servicio', cell: (v) => v.servicio ?? 'A medida' },
  {
    header: 'Total',
    align: 'right',
    // En la tarjeta móvil el saldo es lo accionable; el total sobra.
    hideOnCard: true,
    cell: (v) => <span className="tabular-nums">{mxn.format(Number(v.total))}</span>,
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (v) => (
      <span className="font-semibold tabular-nums">
        {mxn.format(Number(v.saldo))}
      </span>
    ),
  },
  {
    header: 'Vence',
    cell: (v) => (
      <span
        className={cn(
          'inline-flex items-center gap-2',
          v.vencida && 'text-destructive'
        )}
      >
        <span className="whitespace-nowrap">{formatTravelDate(v.due_date)}</span>
        {v.vencida && <Badge variant="destructive">Vencida</Badge>}
      </span>
    ),
  },
  { header: 'Estado', cell: (v) => <StatusBadge status={v.status} /> },
]

const proximosColumns: DataColumn<ProximoViaje>[] = [
  { header: 'Cliente', primary: true, cell: (v) => v.cliente ?? 'Sin cliente' },
  { header: 'Servicio', cell: (v) => v.servicio ?? 'A medida' },
  { header: 'Fecha', cell: (v) => formatTravelDate(v.travel_date) },
  {
    header: 'Pax',
    align: 'right',
    cell: (v) => <span className="tabular-nums">{v.num_pax}</span>,
  },
  { header: 'Estado', cell: (v) => <StatusBadge status={v.status} /> },
]

function VerTodas({ children = 'Ver todas' }: { children?: string }) {
  return (
    <Link
      href="/ventas"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const [summaryRes, profileRes, clawbot] = await Promise.all([
    supabase.rpc('dashboard_summary'),
    supabase
      .from('profiles')
      .select('supplier_id')
      .eq('id', user.id)
      .single(),
    getClawbotResumen(),
  ])

  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as DashboardSummary
  const ventasSaldo = d.ventas_saldo ?? []
  const proximosViajes = d.proximos_viajes ?? []
  const montoVencido = Number(d.monto_vencido ?? 0)
  const numVencidas = Number(d.num_vencidas ?? 0)
  const numCotizaciones = Number(d.num_cotizaciones ?? 0)

  let agencia: string | null = null
  const supplierId = profileRes.data?.supplier_id
  if (supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', supplierId)
      .single()
    agencia = supplier?.name ?? null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Panel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {agencia ? `Resumen operativo de ${agencia}` : 'Resumen operativo'}
          </p>
        </div>
        <Link
          href="/ventas/nueva"
          className={buttonVariants({ variant: 'default' })}
        >
          Nueva venta
        </Link>
      </div>

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el resumen: {summaryRes.error.message}
        </p>
      )}

      {/* KPIs: la foto financiera del momento. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Total vendido"
          value={mxn.format(Number(d.total_vendido ?? 0))}
          detail={pluralVentas(Number(d.num_ventas ?? 0))}
        />
        <Kpi
          label="Por cobrar"
          value={mxn.format(Number(d.por_cobrar ?? 0))}
          detail={`${pluralVentas(Number(d.num_por_cobrar ?? 0))} con saldo pendiente`}
        />
        <Kpi
          label="Ventas activas"
          value={String(Number(d.num_ventas ?? 0))}
          detail="Reservadas, confirmadas y pagadas"
        />
      </div>

      {/* Lo accionable del día: vencidos y cotizaciones sin cerrar. */}
      <section aria-label="Requiere atención" className="space-y-3">
        <h2 className="text-base font-semibold">Requiere atención</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AtencionCard
            tone="danger"
            icon={TriangleAlertIcon}
            label="Pagos vencidos"
            active={numVencidas > 0}
            value={mxn.format(montoVencido)}
            detail={
              numVencidas === 1
                ? '1 venta con fecha de pago vencida'
                : `${numVencidas} ventas con fecha de pago vencida`
            }
            calmDetail="Ninguna venta tiene pagos vencidos."
            href="/ventas"
            linkLabel="Ver ventas"
          />
          <AtencionCard
            tone="pendiente"
            icon={FileTextIcon}
            label="Cotizaciones por cerrar"
            active={numCotizaciones > 0}
            value={String(numCotizaciones)}
            detail={
              numCotizaciones === 1
                ? '1 cotización en borrador por dar seguimiento'
                : `${numCotizaciones} cotizaciones en borrador por dar seguimiento`
            }
            calmDetail="No hay cotizaciones pendientes."
            href="/cotizaciones"
            linkLabel="Ver cotizaciones"
          />
          <AtencionCard
            tone="bot"
            icon={BotIcon}
            label="Clawbot"
            active={Number(clawbot.total ?? 0) > 0}
            value={String(Number(clawbot.total ?? 0))}
            detail={clawbotDetalle(clawbot) || 'Recordatorios por enviar'}
            calmValue="Clawbot al día"
            calmDetail="No hay recordatorios pendientes por enviar."
            href="/clawbot"
            linkLabel="Ver bandeja"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por cobrar</CardTitle>
            <CardDescription>
              Ventas activas con saldo pendiente.
            </CardDescription>
            <CardAction>
              <VerTodas />
            </CardAction>
          </CardHeader>
          <CardContent>
            <DataList
              columns={porCobrarColumns}
              rows={ventasSaldo.slice(0, TOP_N)}
              getRowKey={(v) => v.id}
              rowHref={(v) => `/ventas/${v.id}`}
              empty={
                <EmptyState
                  icon={BanknoteIcon}
                  title="Nada por cobrar"
                  description="Las ventas activas no tienen saldo pendiente."
                />
              }
            />
            {ventasSaldo.length > TOP_N && (
              <p className="mt-3 text-xs text-muted-foreground">
                Mostrando {TOP_N} de {ventasSaldo.length}; el resto está en{' '}
                <Link href="/ventas" className="font-medium text-primary hover:underline">
                  Ventas
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos viajes</CardTitle>
            <CardDescription>
              Salidas con fecha de viaje a partir de hoy.
            </CardDescription>
            <CardAction>
              <VerTodas />
            </CardAction>
          </CardHeader>
          <CardContent>
            <DataList
              columns={proximosColumns}
              rows={proximosViajes.slice(0, TOP_N)}
              getRowKey={(v) => v.id}
              rowHref={(v) => `/ventas/${v.id}`}
              empty={
                <EmptyState
                  icon={CalendarDaysIcon}
                  title="Sin viajes próximos"
                  description="Cuando una venta tenga fecha de viaje futura aparecerá aquí."
                />
              }
            />
            {proximosViajes.length > TOP_N && (
              <p className="mt-3 text-xs text-muted-foreground">
                Mostrando {TOP_N} de {proximosViajes.length}; el resto está en{' '}
                <Link href="/ventas" className="font-medium text-primary hover:underline">
                  Ventas
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
