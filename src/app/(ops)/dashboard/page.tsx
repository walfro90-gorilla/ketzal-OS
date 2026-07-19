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
import { PageHeader } from '@/components/data/page-header'
import { formatTravelDate, mxn } from '@/components/data/format'
import { StatusBadge, type BookingStatus } from '@/components/data/status-badge'
import { getClawbotResumen, type ClawbotResumen } from '../clawbot/data'
import { BarrasTop } from '../reportes/graficas'
import type { Reporte } from '../reportes/tipos'
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
    clave: 'mercado_pago',
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
    card: 'border-amber-500/50 bg-amber-500/5',
    text: 'text-amber-700 dark:text-amber-400',
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
  return (
    <Card className={t?.card}>
      <CardHeader>
        <CardDescription className={t?.text}>{label}</CardDescription>
        <CardTitle className={cn('text-2xl tabular-nums', t?.text)}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
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

  const [summaryRes, periodoRes, bookingsRes, paymentsRes, profileRes, clawbot] =
    await Promise.all([
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
      supabase.from('profiles').select('supplier_id').eq('id', user.id).single(),
      getClawbotResumen(),
    ])

  const d = (summaryRes.data ?? EMPTY_SUMMARY) as unknown as DashboardSummary
  const periodo = (periodoRes.data ?? EMPTY_REPORTE) as unknown as Reporte
  const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[]
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]

  const ventasSaldo = d.ventas_saldo ?? []
  const proximosViajes = d.proximos_viajes ?? []
  const montoVencido = Number(d.monto_vencido ?? 0)
  const numVencidas = Number(d.num_vencidas ?? 0)
  const numCotPend = Number(d.num_cotizaciones ?? 0)

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
        description={agencia ? `Resumen operativo de ${agencia}` : 'Resumen operativo'}
        action={
          <Link
            href="/ventas/nueva"
            className={buttonVariants({ variant: 'default' })}
          >
            Nueva venta
          </Link>
        }
      />

      {summaryRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el resumen: {summaryRes.error.message}
        </p>
      )}

      {/* Lo accionable AHORA (no depende del rango de fechas de abajo). */}
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
        </div>
      </section>

      {/* Resumen del periodo: el filtro manda sobre TODO lo de esta sección. */}
      <section aria-label="Resumen del periodo" className="space-y-4">
        <div className="space-y-3">
          <h2 className="text-base font-semibold">
            {esHoy ? 'Resumen de hoy' : 'Resumen del periodo'}
          </h2>
          <RangoPanel presets={presets} from={from} to={to} />
        </div>

        {periodoRes.error && (
          <p className="text-sm text-destructive">
            Error al cargar el periodo: {periodoRes.error.message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            detail={
              numAbonos > 0
                ? `${numAbonos} ${numAbonos === 1 ? 'abono' : 'abonos'} en el periodo`
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
