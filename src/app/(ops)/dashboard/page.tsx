import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  ArrowRightIcon,
  BanknoteIcon,
  BotIcon,
  CalendarDaysIcon,
  ChartPieIcon,
  CircleCheckIcon,
  FileTextIcon,
  LandmarkIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { BorderBeam } from '@/components/ui/border-beam'
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
import { PageHeader } from '@/components/data/page-header'
import { AgenciaLogo } from '@/components/public/agencia-logo'
import { formatTravelDate, mxn } from '@/components/data/format'
import { StatusBadge, type BookingStatus } from '@/components/data/status-badge'
import { getClawbotResumen, type ClawbotResumen } from '../clawbot/data'
import { getSpeiPendientes } from '../cobranza/data'
import { BarrasTop } from '../reportes/graficas'
import type { Reporte } from '../reportes/tipos'
import { ChecklistArranque, type Onboarding } from './checklist-arranque'
import { UnirseAgencia, type AgenciaParaUnirse } from './unirse-agencia'
import {
  ResumenPlataforma,
  type AgenciaResumen,
  type PersonaResumen,
} from './resumen-plataforma'
import { Dona, SerieVendidoRecibido, type PuntoSerie, type Rebanada } from './graficas'
import { RangoPanel, type PresetRango } from './rango'

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

/** Máximo de filas por lista en el panel; el resto vive en /ventas. */
const TOP_N = 5

// ── Fechas del periodo ───────────────────────────────────────────────
// Mismos cortes de día que reports_summary (UTC), para que las gráficas
// cuadren al centavo con los KPIs del RPC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha local del servidor → "YYYY-MM-DD" (mismo criterio que /reportes). */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Suma n días a un "YYYY-MM-DD" sin corrimiento de zona (mediodía UTC). */
function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function diffDias(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000,
  )
}

/** Lunes de la semana del día dado (bucket semanal estable). */
function inicioSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return addDias(iso, -((d.getUTCDay() + 6) % 7))
}

type Granularidad = 'dia' | 'semana' | 'mes'

function bucketDe(iso: string, gran: Granularidad): string {
  if (gran === 'dia') return iso
  if (gran === 'semana') return inicioSemana(iso)
  return `${iso.slice(0, 7)}-01`
}

function siguienteBucket(bucket: string, gran: Granularidad): string {
  if (gran === 'dia') return addDias(bucket, 1)
  if (gran === 'semana') return addDias(bucket, 7)
  const d = new Date(`${bucket}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// ── Filas crudas del periodo (RLS acota a lo visible del agente) ─────

type BookingRow = {
  created_at: string
  total: number | string
  status: BookingStatus
  num_pax: number | null
}

type PaymentRow = {
  amount_mxn: number | string
  type: string
  payment_method: string | null
  paid_at: string | null
}

/** Estados que reports_summary considera venta (excluye draft/cancelled). */
const ESTADOS_VENTA: BookingStatus[] = ['reserved', 'confirmed', 'paid']

// Dona de estados: el funnel Reservada→Confirmada→Pagada es una rampa
// ordinal del teal de marca (validada claro/oscuro con validate_palette);
// Cotización es gris neutro (aún no es venta) y Cancelada usa el token
// destructive — la falla salta a la vista. La leyenda con cifras es el
// canal confiable de identidad (nunca el color solo).
const ESTADO_DONA: {
  status: BookingStatus
  etiqueta: string
  fillClass: string
  swatchClass: string
}[] = [
  {
    status: 'draft',
    etiqueta: 'Cotización',
    fillClass: 'fill-neutral-400 dark:fill-neutral-500',
    swatchClass: 'bg-neutral-400 dark:bg-neutral-500',
  },
  {
    status: 'reserved',
    etiqueta: 'Reservada',
    fillClass: 'fill-[#14b8a6] dark:fill-[#0d9488]',
    swatchClass: 'bg-[#14b8a6] dark:bg-[#0d9488]',
  },
  {
    status: 'confirmed',
    etiqueta: 'Confirmada',
    fillClass: 'fill-[#0f766e] dark:fill-[#14b8a6]',
    swatchClass: 'bg-[#0f766e] dark:bg-[#14b8a6]',
  },
  {
    status: 'paid',
    etiqueta: 'Pagada',
    fillClass: 'fill-[#134e4a] dark:fill-[#2dd4bf]',
    swatchClass: 'bg-[#134e4a] dark:bg-[#2dd4bf]',
  },
  {
    status: 'cancelled',
    etiqueta: 'Cancelada',
    fillClass: 'fill-destructive',
    swatchClass: 'bg-destructive',
  },
]

// Dona de métodos: categorías nominales con la paleta categórica del método
// dataviz (orden fijo por método, validada claro/oscuro; la leyenda con
// montos cubre el relief de contraste de magenta/amarillo/aqua en claro).
const METODO_DONA: {
  clave: string
  etiqueta: string
  fillClass: string
  swatchClass: string
}[] = [
  {
    clave: 'efectivo',
    etiqueta: 'Efectivo',
    fillClass: 'fill-[#2a78d6] dark:fill-[#3987e5]',
    swatchClass: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  },
  {
    clave: 'transferencia',
    etiqueta: 'Transferencia',
    fillClass: 'fill-[#008300]',
    swatchClass: 'bg-[#008300]',
  },
  {
    clave: 'deposito',
    etiqueta: 'Depósito',
    fillClass: 'fill-[#e87ba4] dark:fill-[#d55181]',
    swatchClass: 'bg-[#e87ba4] dark:bg-[#d55181]',
  },
  {
    clave: 'tarjeta',
    etiqueta: 'Tarjeta',
    fillClass: 'fill-[#eda100] dark:fill-[#c98500]',
    swatchClass: 'bg-[#eda100] dark:bg-[#c98500]',
  },
  {
    // `mercadopago` sin guión: es lo que escribe `confirm_online_payment` (su
    // default desde b034) en TODO cobro en línea. Con la clave vieja
    // (`mercado_pago`) esta rebanada era siempre $0 y los cobros de MP caían
    // en "Otro" por la lista blanca de abajo.
    clave: 'mercadopago',
    etiqueta: 'Mercado Pago',
    fillClass: 'fill-[#1baf7a] dark:fill-[#199e70]',
    swatchClass: 'bg-[#1baf7a] dark:bg-[#199e70]',
  },
  {
    clave: 'otro',
    etiqueta: 'Otro',
    fillClass: 'fill-[#eb6834] dark:fill-[#d95926]',
    swatchClass: 'bg-[#eb6834] dark:bg-[#d95926]',
  },
]

const mxnCompacto = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
})

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
// cifra 2xl tabular, detalle xs. `tone` tiñe la tarjeta cuando la cifra
// pide atención (ámbar = pendiente, destructive = pérdida).

const KPI_TONES = {
  amber: {
    // Marigold de marca (--warning), no el ámbar genérico de Tailwind.
    card: 'border-warning/40 bg-warning/8',
    text: 'text-[oklch(0.45_0.11_65)] dark:text-warning',
  },
  destructive: {
    card: 'border-destructive/50 bg-destructive/5',
    text: 'text-destructive',
  },
} as const

function Kpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: keyof typeof KPI_TONES
}) {
  const t = tone ? KPI_TONES[tone] : null
  // Haz ámbar solo cuando el KPI pide atención (ej. "Por cobrar" con saldo).
  const beam = tone === 'amber'
  return (
    <Card className={cn(beam && 'relative', t?.card, 'gap-1 py-3 sm:gap-2 sm:py-6')}>
      {beam && <BorderBeam duration={9} colorFrom="#f5a524" colorTo="#f7b84b" />}
      <CardHeader className="px-3 sm:px-6">
        <CardDescription className={cn('text-xs', t?.text)}>{label}</CardDescription>
        <CardTitle className={cn('text-xl tabular-nums sm:text-2xl', t?.text)}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <p className={cn('text-xs', t?.text ?? 'text-muted-foreground')}>
          {detail}
        </p>
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
  // Pendiente = marigold de marca (--warning), la convención "energía/por hacer".
  pendiente: {
    card: 'bg-warning/8 ring-warning/40',
    text: 'text-[oklch(0.45_0.11_65)] dark:text-warning',
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

  // Jerarquía por estado: "todo al día" es una buena noticia y no merece una
  // tarjeta entera — en móvil tres de estas empujaban el resumen fuera de la
  // pantalla. Colapsa a una fila con su enlace; desde sm: vuelve a ser tarjeta,
  // donde el espacio no es el recurso escaso. La alerta nunca se encoge: es lo
  // único que hay que ver.
  if (!active) {
    return (
      <>
        <Link
          href={href}
          className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 sm:hidden"
        >
          <CircleCheckIcon className="size-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">{label}: </span>
            <span className="font-medium">{calmValue}</span>
          </span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>

        <Card className="hidden sm:block">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
              {label}
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums text-muted-foreground">
              {calmValue}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <p className="text-xs text-muted-foreground">{calmDetail}</p>
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {linkLabel}
              <ArrowRightIcon className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <Card className={active ? t.card : undefined}>
      <CardHeader>
        <CardDescription
          className={cn('flex items-center gap-1.5', active && t.text)}
        >
          {active ? (
            <Icon className="size-3.5 shrink-0" />
          ) : (
            <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
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

/**
 * Cabecera de identidad de la agencia: logo, nombre y el tamaño de la
 * operación en tres cifras. Responde "dónde estoy y qué tan grande es esto"
 * antes de cualquier número del día — el PageHeader solo lo decía en una línea
 * de texto gris.
 *
 * Las cifras son de INVENTARIO (lo que la agencia tiene), no de desempeño: el
 * dinero vive abajo, en Resumen, y mezclarlos aquí competiría con él.
 */
function CabeceraAgencia({
  nombre,
  logo,
  servicios,
  clientes,
  equipo,
}: {
  nombre: string
  logo: string | null
  servicios: number
  clientes: number
  equipo: number
}) {
  const cifras = [
    { n: servicios, label: servicios === 1 ? 'servicio' : 'servicios' },
    { n: clientes, label: clientes === 1 ? 'cliente' : 'clientes' },
    { n: equipo, label: equipo === 1 ? 'persona' : 'en el equipo' },
  ]
  return (
    <section
      aria-label="Tu agencia"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <AgenciaLogo url={logo} nombre={nombre} tamano="md" className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold tracking-[-0.01em]">
            {nombre}
          </p>
          <p className="text-xs text-muted-foreground">Tu agencia</p>
        </div>
      </div>
      <dl className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 sm:justify-end">
        {cifras.map((c) => (
          <div key={c.label} className="flex items-baseline gap-1.5">
            <dd className="text-xl font-semibold tabular-nums">{c.n}</dd>
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
          </div>
        ))}
      </dl>
    </section>
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

function SinDatosPeriodo({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const hoy = isoDate(new Date())

  // Default: el resumen del día actual. Presets antes que el rango custom.
  const rawFrom = typeof params.from === 'string' ? params.from : undefined
  const rawTo = typeof params.to === 'string' ? params.to : undefined
  let from = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : hoy
  let to = rawTo && DATE_RE.test(rawTo) ? rawTo : hoy
  if (from > to) [from, to] = [to, from]
  const toExclusivo = addDias(to, 1)

  const presets: PresetRango[] = [
    { label: 'Hoy', from: hoy, to: hoy },
    { label: '7 días', from: addDias(hoy, -6), to: hoy },
    { label: '30 días', from: addDias(hoy, -29), to: hoy },
    { label: 'Este mes', from: `${hoy.slice(0, 7)}-01`, to: hoy },
  ]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const [
    summaryRes,
    periodoRes,
    bookingsRes,
    paymentsRes,
    profileRes,
    clawbot,
    anomaliasRes,
    speiPendientes,
    onboardingRes,
    agenciasRes,
  ] = await Promise.all([
      supabase.rpc('dashboard_summary'),
      supabase.rpc('reports_summary', { p_from: from, p_to: to }),
      // Filas crudas del periodo para las gráficas; RLS acota la visibilidad
      // igual que en las listas. Mismos cortes de día (UTC) que el RPC.
      supabase
        .from('bookings')
        .select('created_at, total, status, num_pax')
        .gte('created_at', from)
        .lt('created_at', toExclusivo),
      supabase
        .from('payments')
        .select('amount_mxn, type, payment_method, paid_at')
        .eq('status', 'COMPLETED')
        .gte('paid_at', from)
        .lt('paid_at', toExclusivo),
      supabase.from('profiles').select('supplier_id, role').eq('id', user.id).single(),
      getClawbotResumen(),
      // Anomalías de dinero (sobrepago / pagado_sin_cupo / pago_cancelado) que el
      // webhook dejó en system_log y necesitan revisión/reembolso manual.
      supabase.rpc('alertas_anomalias_dinero' as never),
      // Transferencias SPEI declaradas por confirmar (b034); [] para no-admin.
      getSpeiPendientes(),
      // b064: checklist de arranque. El RPC devuelve null salvo para el admin de
      // una agencia, así que la tarjeta ni se pinta para los demás.
      supabase.rpc('onboarding_agencia' as never),
      // b065: agencias a las que un agente SIN agencia puede pedir entrar. El
      // RPC levanta si ya perteneces a una ⇒ el error es la señal de "no aplica"
      // y la tarjeta no se pinta.
      supabase.rpc('list_agencies_to_join' as never),
    ])

  // b064: null salvo para el admin de una agencia (el RPC lo decide).
  const onboarding = (onboardingRes.data ?? null) as unknown as Onboarding | null

  // b065: sólo llega con datos si el agente NO tiene agencia (si la tiene, el
  // RPC levanta y `data` viene null).
  const agenciasParaUnirse = (agenciasRes.data ?? null) as unknown as
    | AgenciaParaUnirse[]
    | null

  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as DashboardSummary
  const periodo = (periodoRes.data ?? EMPTY_REPORTE) as unknown as Reporte
  const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[]
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]

  // Anomalías de dinero pendientes de revisión (últimas 3 semanas).
  const anomalias = (anomaliasRes.data ?? {
    total: 0,
    sobrepago: 0,
    sin_cupo: 0,
    cancelado: 0,
  }) as unknown as {
    total: number
    sobrepago: number
    sin_cupo: number
    cancelado: number
  }
  const numAnomalias = Number(anomalias.total ?? 0)
  const anomaliaDetalle =
    [
      anomalias.sobrepago
        ? `${anomalias.sobrepago} sobrepago${anomalias.sobrepago > 1 ? 's' : ''}`
        : null,
      anomalias.sin_cupo ? `${anomalias.sin_cupo} pagado sin cupo` : null,
      anomalias.cancelado
        ? `${anomalias.cancelado} en venta cancelada`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Pagos que requieren revisión'

  const numSpei = speiPendientes.length
  const montoSpei = speiPendientes.reduce((s, r) => s + Number(r.amount), 0)

  const ventasSaldo = d.ventas_saldo ?? []
  const proximosViajes = d.proximos_viajes ?? []
  const montoVencido = Number(d.monto_vencido ?? 0)
  const numVencidas = Number(d.num_vencidas ?? 0)
  const numCotPend = Number(d.num_cotizaciones ?? 0)

  // El superadmin no pertenece a ninguna agencia: las administra todas. Sin
  // esto, el RPC de agente libre le ofrecía "Solicitar entrar" a las agencias
  // del propio fundador, porque no distingue "sin agencia" de "dueño de todo".
  const esSuperadmin =
    (profileRes.data as { role?: string } | null)?.role === 'superadmin'

  let plataformaAgencias: AgenciaResumen[] = []
  let plataformaEmbajadores: PersonaResumen[] = []
  let plataformaViajeros: PersonaResumen[] = []
  let totalEmbajadores = 0
  let totalViajeros = 0
  if (esSuperadmin) {
    // Viajeros y embajadores se leen por RPC DEFINER, NO por `from('profiles')`:
    // la RLS de `profiles` es solo-propio incluso para el superadmin (medido:
    // ve 1 fila, la suya). Una consulta directa no falla — devuelve vacío, y el
    // panel diría "0 viajeros" con dos viajeros en la tabla. Mismos RPCs que ya
    // usan /viajeros y /comisiones.
    const [agsRes, viajRes, embRes] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, img_logo')
        .eq('supplier_type', 'agency')
        .order('name'),
      supabase.rpc('list_travelers' as never),
      supabase.rpc('list_ambassadors' as never),
    ])
    plataformaAgencias = (
      (agsRes.data ?? []) as unknown as {
        id: string
        name: string
        img_logo: string | null
      }[]
    ).map((a) => ({ id: a.id, nombre: a.name, logo: a.img_logo }))

    // `list_travelers` ya viene por alta descendente; el corte es solo para que
    // el carrusel no crezca sin fin.
    const viajeros = (viajRes.data ?? []) as unknown as {
      id: string
      full_name: string | null
      email: string | null
      image: string | null
    }[]
    plataformaViajeros = viajeros.slice(0, 12).map((v) => ({
      id: v.id,
      nombre: v.full_name ?? v.email?.split('@')[0] ?? 'Viajero',
      avatar: v.image,
    }))

    const embs = (embRes.data ?? []) as unknown as {
      id: string
      name: string | null
    }[]
    plataformaEmbajadores = embs.slice(0, 12).map((e) => ({
      id: e.id,
      nombre: e.name ?? 'Embajador',
      avatar: null, // `list_ambassadors` no expone foto; inicial y ya
    }))

    totalViajeros = viajeros.length
    totalEmbajadores = embs.length
  }

  let agencia: string | null = null
  let agenciaLogo: string | null = null
  let numServicios = 0
  let numClientes = 0
  let numEquipo = 0
  const supplierId = profileRes.data?.supplier_id
  if (supplierId) {
    // La cabecera de identidad: quién eres y de qué tamaño es tu operación.
    // Son `count` con `head: true` (no traen filas) y la RLS ya acota cada
    // tabla a la agencia, así que no hace falta filtrar a mano salvo en
    // `services`, que sí es visible entre agencias por el catálogo público.
    const [supplierRes, serviciosRes, clientesRes, equipoRes] = await Promise.all([
      // `img_logo` no está en database.types.ts (archivo con un solo dueño) ⇒ cast.
      supabase
        .from('suppliers' as never)
        .select('name, img_logo')
        .eq('id', supplierId)
        .single(),
      supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId),
    ])
    const sup = supplierRes.data as unknown as
      | { name: string | null; img_logo: string | null }
      | null
    agencia = sup?.name ?? null
    agenciaLogo = sup?.img_logo ?? null
    numServicios = serviciosRes.count ?? 0
    numClientes = clientesRes.count ?? 0
    numEquipo = equipoRes.count ?? 0
  }

  // ── Agregados del periodo (solo presentación; el dinero manda el RPC) ──

  const numDias = diffDias(from, to) + 1
  const gran: Granularidad =
    numDias <= 120 ? 'dia' : numDias <= 900 ? 'semana' : 'mes'
  const granLabel =
    gran === 'dia' ? 'por día' : gran === 'semana' ? 'por semana' : 'por mes'

  const vendidoPor = new Map<string, number>()
  const estadoCount = new Map<BookingStatus, number>()
  let pax = 0
  let cotizacionesCreadas = 0
  let canceladas = 0
  let montoCancelado = 0

  for (const b of bookings) {
    const bucket = bucketDe(b.created_at.slice(0, 10), gran)
    estadoCount.set(b.status, (estadoCount.get(b.status) ?? 0) + 1)
    if (ESTADOS_VENTA.includes(b.status)) {
      vendidoPor.set(bucket, (vendidoPor.get(bucket) ?? 0) + Number(b.total))
      pax += Number(b.num_pax ?? 0)
    } else if (b.status === 'draft') {
      cotizacionesCreadas += 1
    } else if (b.status === 'cancelled') {
      canceladas += 1
      montoCancelado += Number(b.total)
    }
  }

  const recibidoPor = new Map<string, number>()
  const metodoTotal = new Map<string, number>()
  let recibidoTotal = 0
  let numAbonos = 0
  let numDevoluciones = 0
  let montoDevuelto = 0
  for (const p of payments) {
    if (!p.paid_at) continue
    const signo = p.type === 'refund' ? -1 : 1
    const monto = signo * Number(p.amount_mxn)
    const bucket = bucketDe(p.paid_at.slice(0, 10), gran)
    recibidoPor.set(bucket, (recibidoPor.get(bucket) ?? 0) + monto)
    const metodo = METODO_DONA.some((m) => m.clave === p.payment_method)
      ? (p.payment_method as string)
      : 'otro'
    metodoTotal.set(metodo, (metodoTotal.get(metodo) ?? 0) + monto)
    recibidoTotal += monto
    if (signo > 0) numAbonos += 1
    else {
      numDevoluciones += 1
      montoDevuelto += Number(p.amount_mxn)
    }
  }

  // Buckets continuos del rango (los días sin movimiento cuentan cero).
  const puntos: PuntoSerie[] = []
  for (
    let b = bucketDe(from, gran);
    b <= to;
    b = siguienteBucket(b, gran)
  ) {
    puntos.push({
      dia: b,
      vendido: vendidoPor.get(b) ?? 0,
      recibido: recibidoPor.get(b) ?? 0,
    })
  }

  const estadoItems: Rebanada[] = ESTADO_DONA.map((e) => ({
    clave: e.status,
    etiqueta: e.etiqueta,
    valor: estadoCount.get(e.status) ?? 0,
    fillClass: e.fillClass,
    swatchClass: e.swatchClass,
  }))
  const totalBookings = bookings.length

  const metodoItems: Rebanada[] = METODO_DONA.map((m) => ({
    clave: m.clave,
    etiqueta: m.etiqueta,
    valor: metodoTotal.get(m.clave) ?? 0,
    fillClass: m.fillClass,
    swatchClass: m.swatchClass,
    cifra: mxn.format(metodoTotal.get(m.clave) ?? 0),
  })).filter((m) => m.valor !== 0)

  const totalVendido = Number(periodo.total_vendido ?? 0)
  const numVentas = Number(periodo.num_ventas ?? 0)
  const porCobrarPeriodo = Number(periodo.saldo_por_cobrar ?? 0)

  const esHoy = from === hoy && to === hoy

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel"
        description={agencia ? 'Tu operación de hoy' : 'Resumen operativo'}
        action={
          <Link
            href="/ventas/nueva"
            className={buttonVariants({ variant: 'default' })}
          >
            Nueva venta
          </Link>
        }
      />

      {/* El superadmin ve la PLATAFORMA (quién se está sumando); el admin de
          agencia ve la suya. Nunca las dos. */}
      {esSuperadmin && (
        <ResumenPlataforma
          agencias={plataformaAgencias}
          embajadores={plataformaEmbajadores}
          viajeros={plataformaViajeros}
          totalEmbajadores={totalEmbajadores}
          totalViajeros={totalViajeros}
        />
      )}

      {agencia && !esSuperadmin && (
        <CabeceraAgencia
          nombre={agencia}
          logo={agenciaLogo}
          servicios={numServicios}
          clientes={numClientes}
          equipo={numEquipo}
        />
      )}

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el resumen: {summaryRes.error.message}
        </p>
      )}

      {/* b065: el agente libre puede pedir entrar a una agencia. Ser agente
          libre es una posición legítima, así que esto es una puerta, no un
          error que corregir. Al superadmin NO: `list_agencies_to_join` solo
          mira si tienes `supplier_id`, y el suyo es null, así que le ofrecía
          pedir permiso para entrar a sus propias agencias. */}
      {agenciasParaUnirse && !esSuperadmin && (
        <UnirseAgencia agencias={agenciasParaUnirse} />
      )}

      {/* Resumen del periodo: el filtro manda sobre TODO lo de esta sección. */}
      <section aria-label="Resumen del periodo" className="space-y-4">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
            {esHoy ? 'Resumen de hoy' : 'Resumen del periodo'}
          </h2>
          <RangoPanel presets={presets} from={from} to={to} />
        </div>

        {periodoRes.error && (
          <p className="text-sm text-destructive">
            Error al cargar el periodo: {periodoRes.error.message}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Vendido"
            value={mxn.format(totalVendido)}
            detail={
              numVentas > 0
                ? `${pluralVentas(numVentas)} · ${pax} pax · ticket ${mxn.format(Number(periodo.ticket_promedio ?? 0))}`
                : 'Sin ventas en el periodo'
            }
          />
          <Kpi
            label="Dinero recibido"
            value={mxn.format(recibidoTotal)}
            // Neto del periodo (abonos − devoluciones): si hubo devoluciones, el
            // detalle las desglosa para que un neto negativo se explique solo.
            detail={
              numAbonos > 0 || numDevoluciones > 0
                ? [
                    numAbonos > 0
                      ? `${numAbonos} ${numAbonos === 1 ? 'abono' : 'abonos'}`
                      : null,
                    numDevoluciones > 0
                      ? `${numDevoluciones} ${numDevoluciones === 1 ? 'devolución' : 'devoluciones'} (−${mxn.format(montoDevuelto)})`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') + ' en el periodo'
                : 'Sin abonos en el periodo'
            }
          />
          <Kpi
            label="Por cobrar"
            value={mxn.format(porCobrarPeriodo)}
            detail="Saldo de lo vendido en el periodo"
            tone={porCobrarPeriodo > 0 ? 'amber' : undefined}
          />
          <Kpi
            label="Comisión"
            value={mxn.format(Number(periodo.total_comision ?? 0))}
            detail="Reventas y agentes libres"
          />
          <Kpi
            label="Cotizaciones"
            value={String(cotizacionesCreadas)}
            detail="Creadas en el periodo"
          />
          <Kpi
            label="Canceladas"
            value={String(canceladas)}
            detail={
              canceladas > 0
                ? `${mxn.format(montoCancelado)} cancelados`
                : 'Sin cancelaciones'
            }
            tone={canceladas > 0 ? 'destructive' : undefined}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vendido vs dinero recibido</CardTitle>
            <CardDescription>
              Lo vendido (ventas creadas) y el dinero que entró, {granLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SerieVendidoRecibido puntos={puntos} />
            {puntos.every((p) => p.vendido === 0 && p.recibido === 0) && (
              <SinDatosPeriodo>
                Sin movimientos en el periodo. Cambia el rango de fechas o
                registra tu primera venta.
              </SinDatosPeriodo>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ventas por estado</CardTitle>
              <CardDescription>
                Todo lo creado en el periodo, de cotización a cancelada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {totalBookings > 0 ? (
                <Dona
                  items={estadoItems}
                  centro={String(totalBookings)}
                  centroDetalle={totalBookings === 1 ? 'venta' : 'ventas'}
                  ariaLabel="Distribución de ventas del periodo por estado"
                />
              ) : (
                <SinDatosPeriodo>Sin ventas en el periodo.</SinDatosPeriodo>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dinero recibido por método</CardTitle>
              <CardDescription>
                Cómo entró el dinero del periodo (neto de reembolsos).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metodoItems.length > 0 && recibidoTotal > 0 ? (
                <Dona
                  items={metodoItems}
                  centro={mxnCompacto.format(recibidoTotal)}
                  centroDetalle="recibido"
                  ariaLabel="Dinero recibido en el periodo por método de pago"
                />
              ) : (
                <SinDatosPeriodo>Sin abonos en el periodo.</SinDatosPeriodo>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top servicios</CardTitle>
              <CardDescription>
                Los servicios más vendidos del periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(periodo.por_servicio ?? []).length > 0 ? (
                <BarrasTop
                  items={(periodo.por_servicio ?? []).map((r) => ({
                    clave: r.servicio,
                    etiqueta: r.servicio,
                    valor: Number(r.vendido),
                    detalle: `${r.servicio} · ${mxn.format(Number(r.vendido))} · ${pluralVentas(
                      Number(r.num),
                    )}`,
                  }))}
                />
              ) : (
                <SinDatosPeriodo>Sin ventas en el periodo.</SinDatosPeriodo>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por agente</CardTitle>
              <CardDescription>
                Lo vendido por cada agente en el periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(periodo.por_agente ?? []).length > 0 ? (
                <BarrasTop
                  items={(periodo.por_agente ?? []).map((r) => ({
                    clave: r.agente,
                    etiqueta: r.agente,
                    valor: Number(r.vendido),
                    detalle: `${r.agente} · ${mxn.format(Number(r.vendido))} · ${pluralVentas(
                      Number(r.num),
                    )} · comisión ${mxn.format(Number(r.comision))}`,
                  }))}
                />
              ) : (
                <SinDatosPeriodo>Sin ventas en el periodo.</SinDatosPeriodo>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChartPieIcon className="size-3.5 shrink-0" />
          Reporte completo con exportación CSV en{' '}
          <Link href="/reportes" className="font-medium text-primary hover:underline">
            Reportes
          </Link>
          .
        </p>
      </section>

      {/* Lo accionable AHORA (no depende del rango de fechas de abajo). */}
      {/* b064: primeros pasos de la agencia. Sólo mientras quede algo pendiente;
          desaparece solo al completarse (el RPC lo deriva, no hay flag).
          Va DESPUÉS del resumen del día: es guía de arranque, no la operación
          de hoy — con 7 de 8 hechos empujaba los números fuera de la pantalla. */}
      {onboarding && onboarding.pendientes > 0 && (
        <ChecklistArranque data={onboarding} />
      )}

      <section aria-label="Requiere atención" className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          Requiere atención
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
            href="/cobranza"
            linkLabel="Ver cobranza"
          />
          <AtencionCard
            tone="pendiente"
            icon={FileTextIcon}
            label="Cotizaciones por cerrar"
            active={numCotPend > 0}
            value={String(numCotPend)}
            detail={
              numCotPend === 1
                ? '1 cotización en borrador por dar seguimiento'
                : `${numCotPend} cotizaciones en borrador por dar seguimiento`
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
          <AtencionCard
            tone="pendiente"
            icon={LandmarkIcon}
            label="Pagos por confirmar"
            active={numSpei > 0}
            value={mxn.format(montoSpei)}
            detail={
              numSpei === 1
                ? '1 transferencia SPEI declarada por revisar'
                : `${numSpei} transferencias SPEI declaradas por revisar`
            }
            calmValue="Sin transferencias"
            calmDetail="No hay transferencias SPEI por confirmar."
            href="/cobranza"
            linkLabel="Ver cobranza"
          />
          <AtencionCard
            tone="danger"
            icon={BanknoteIcon}
            label="Anomalías de pago"
            active={numAnomalias > 0}
            value={String(numAnomalias)}
            detail={`${anomaliaDetalle} — revisa y reembolsa si aplica`}
            calmValue="Pagos en orden"
            calmDetail="Sin anomalías de pago en las últimas 3 semanas."
            href="/salud"
            linkLabel="Ver salud"
          />
        </div>
      </section>

      {/* Operación viva (no depende del rango): deudas y salidas próximas. */}
      <section aria-label="Operación actual" className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por cobrar</CardTitle>
            <CardDescription>
              {Number(d.por_cobrar ?? 0) > 0
                ? `${mxn.format(Number(d.por_cobrar ?? 0))} pendientes en ${pluralVentas(Number(d.num_por_cobrar ?? 0))} activas.`
                : 'Ventas activas con saldo pendiente.'}
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
      </section>
    </div>
  )
}
