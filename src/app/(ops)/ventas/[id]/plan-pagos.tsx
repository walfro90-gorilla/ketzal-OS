'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CircleCheckIcon, CircleAlertIcon, ClockIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { formatTravelDate, mxn } from '@/components/data/format'
import {
  crearPlanPagos,
  previewPlanPagos,
  quitarPlanPagos,
  type FrecuenciaPlan,
} from './actions'
import { conSaldoCorrido } from '@/lib/domain/payment-plan'

/** Fila de `payment_schedule` (seq 0 = enganche, seq k = abono k). */
export type PlanItem = {
  seq: number
  kind: 'enganche' | 'abono'
  due_date: string
  amount: number
}

/** JSON que regresa el RPC de vista previa (`previewPlanPagos`). */
type Plan = {
  total: number
  enganche: number
  resto: number
  frecuencia: string
  num_abonos: number
  monto_abono: number
  inicio: string
  final: string
  items: PlanItem[]
}

type PreviewState =
  | { key: string; plan: Plan }
  | { key: string; error: string }

const FRECUENCIAS: { value: FrecuenciaPlan; label: string }[] = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

const FRECUENCIA_LABELS: Record<string, string> = Object.fromEntries(
  FRECUENCIAS.map((f) => [f.value, f.label])
)

/** Hoy en formato YYYY-MM-DD (zona local), comparable con `due_date`. */
function hoy(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Tabla del calendario (preview o plan guardado) con saldo corrido:
 * saldo tras cada fila = total − suma acumulada de montos.
 */
function PlanTable({
  items,
  total,
  nextSeq = null,
  pagado = null,
}: {
  items: PlanItem[]
  total: number
  /** seq del próximo pago a resaltar (null = sin resaltado, p. ej. en preview). */
  nextSeq?: number | null
  /** Pagado real (Σ abonos − reembolsos): activa el checklist de estado por
   *  renglón — verde cubierto, rojo vencido, ámbar próximo (mismas reglas que
   *  el plan del viajero en /mis-compras). null = sin estado (preview). */
  pagado?: number | null
}) {
  // Saldo corrido: saldo tras cada fila = total − suma acumulada de montos.
  // Cálculo puro y testeado en @/lib/domain/payment-plan.
  const rows = conSaldoCorrido(items, total)
  const today = hoy()

  // Estado por renglón contra el pagado real: cubierto cuando el acumulado del
  // calendario (total − saldo restante) cabe en lo pagado (regla de oro #2).
  const estadoDe = (row: (typeof rows)[number]) => {
    if (pagado == null) return null
    const cum = total - row.saldo
    if (cum <= pagado + 0.005) return 'pagado' as const
    return row.due_date < today ? ('vencido' as const) : ('proximo' as const)
  }
  const TONO_ESTADO = {
    pagado: 'text-emerald-600 dark:text-emerald-500',
    vencido: 'text-destructive',
    proximo: 'text-amber-600 dark:text-amber-500',
  } as const
  const ICONO_ESTADO = {
    pagado: CircleCheckIcon,
    vencido: CircleAlertIcon,
    proximo: ClockIcon,
  } as const

  // Columnas dentro del componente para cerrar sobre `nextSeq` (resaltado del
  // próximo pago). El tinte de fila del desktop lo reemplaza el badge "Próximo",
  // que en las tarjetas móviles también marca la fila accionable.
  const columns: DataColumn<(typeof rows)[number]>[] = [
    {
      header: 'Concepto',
      primary: true,
      cell: (row) => {
        const estado = estadoDe(row)
        const Icono = estado ? ICONO_ESTADO[estado] : null
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              estado && TONO_ESTADO[estado]
            )}
          >
            {Icono && <Icono className="size-4 shrink-0" />}
            {row.kind === 'enganche' ? 'Enganche' : `Abono ${row.seq}`}
          </span>
        )
      },
    },
    {
      header: 'Fecha',
      cell: (row) => {
        const esProximo = nextSeq != null && row.seq === nextSeq
        return (
          <span className="inline-flex items-center whitespace-nowrap">
            {formatTravelDate(row.due_date)}
            {esProximo && (
              <Badge
                variant="outline"
                className="ml-2 border-primary/30 bg-primary/10 text-primary"
              >
                Próximo
              </Badge>
            )}
          </span>
        )
      },
    },
    {
      header: 'Monto',
      align: 'right',
      cell: (row) => {
        const estado = estadoDe(row)
        return (
          <span className={cn('tabular-nums', estado && TONO_ESTADO[estado])}>
            {mxn.format(Number(row.amount))}
          </span>
        )
      },
    },
    {
      header: 'Saldo restante',
      align: 'right',
      cell: (row) => (
        <span className="tabular-nums">{mxn.format(row.saldo)}</span>
      ),
    },
  ]

  return (
    <DataList
      columns={columns}
      rows={rows}
      getRowKey={(row) => String(row.seq)}
    />
  )
}

export function PlanPagosSection({
  bookingId,
  total,
  travelDate,
  paymentType,
  planFrequency,
  planFinalDate,
  schedule,
  cancelled = false,
  pagado = 0,
}: {
  bookingId: string
  total: number
  travelDate: string | null
  paymentType: string
  planFrequency: string | null
  planFinalDate: string | null
  schedule: PlanItem[]
  /** Venta cancelada: el plan (si existe) queda visible pero de solo lectura. */
  cancelled?: boolean
  /** Pagado real (Σ abonos − reembolsos COMPLETED): checklist + congela el plan. */
  pagado?: number
}) {
  const hasPlan = paymentType === 'abonos' && schedule.length > 0
  // Con pagos aprobados el plan queda CONGELADO: el cliente ya pagó contra ese
  // calendario. La acción quitarPlanPagos tiene el mismo guard server-side.
  const tienePagos = pagado > 0.005

  // ── Formulario de configuración (estado 1) ────────────────────────────
  const [frequency, setFrequency] = useState<FrecuenciaPlan>('quincenal')
  const [pctStr, setPctStr] = useState('20')
  const [finalDate, setFinalDate] = useState(travelDate ?? '')
  const [isCreating, startCreating] = useTransition()
  const [isRemoving, startRemoving] = useTransition()

  const pct = Number(pctStr)
  const pctValido = pctStr.trim() !== '' && Number.isFinite(pct) && pct >= 1 && pct <= 99
  const inputsValidos = !hasPlan && !cancelled && finalDate !== '' && pctValido && total > 0

  // La clave codifica los inputs: el resultado solo se muestra si su clave
  // coincide con la actual (así no hay que "limpiar" el preview con setState).
  const previewKey = inputsValidos
    ? `${frequency}|${finalDate}|${pct}|${total}`
    : null

  const [result, setResult] = useState<PreviewState | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    // Cada cambio invalida las respuestas en vuelo (guard anti-stale).
    const mySeq = ++seqRef.current
    if (previewKey == null) return
    const timer = setTimeout(async () => {
      const res = await previewPlanPagos(total, finalDate, frequency, pct / 100)
      if (seqRef.current !== mySeq) return // llegó tarde: el formulario ya cambió
      if ('error' in res) {
        setResult({ key: previewKey, error: res.error })
        return
      }
      const raw = res.plan as { error?: unknown; items?: unknown } | null
      if (raw && typeof raw.error === 'string') {
        setResult({ key: previewKey, error: raw.error })
      } else if (!raw || !Array.isArray(raw.items)) {
        setResult({ key: previewKey, error: 'No se pudo calcular el plan.' })
      } else {
        setResult({ key: previewKey, plan: raw as unknown as Plan })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [previewKey, total, finalDate, frequency, pct])

  const current = previewKey != null && result?.key === previewKey ? result : null
  const currentPlan = current != null && 'plan' in current ? current.plan : null
  const currentError = current != null && 'error' in current ? current.error : null
  const calculando = previewKey != null && current == null

  function handleCrear() {
    if (currentPlan == null) return
    startCreating(async () => {
      const res = await crearPlanPagos(bookingId, frequency, finalDate, pct / 100)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      // revalidatePath refresca la página: se re-renderiza al estado 2.
      toast.success('Plan de pagos creado')
    })
  }

  function handleQuitar() {
    startRemoving(async () => {
      const res = await quitarPlanPagos(bookingId)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Plan quitado')
    })
  }

  // Sin plan y sin nada que planear: cancelada o ya liquidada (pagado cubre el
  // total) ⇒ no se ofrece crear un plan. Con plan existente sí se muestra
  // (checklist en verde, congelado).
  const liquidada = pagado + 0.005 >= total
  if (!hasPlan && (cancelled || liquidada)) return null

  // ── Estado 2: ya hay plan guardado ────────────────────────────────────
  if (hasPlan) {
    const enganche = schedule.find((s) => s.kind === 'enganche')
    const numAbonos = schedule.filter((s) => s.kind === 'abono').length
    const today = hoy()
    const proximo = schedule.find((s) => s.due_date >= today)
    // Renglones cubiertos por el pagado real (mismo criterio que el checklist
    // del viajero): acumulado del calendario ≤ pagado.
    let cum = 0
    const cubiertos = schedule.filter((s) => {
      cum += Number(s.amount)
      return cum <= pagado + 0.005
    }).length

    return (
      <Card>
        <CardHeader>
          <CardTitle>Plan de pagos</CardTitle>
          <CardDescription>
            Enganche de {mxn.format(Number(enganche?.amount ?? 0))} +{' '}
            {numAbonos} {numAbonos === 1 ? 'abono' : 'abonos'}
            {planFrequency &&
              ` · ${FRECUENCIA_LABELS[planFrequency] ?? planFrequency}`}
            {planFinalDate && ` · hasta ${formatTravelDate(planFinalDate)}`}
            {` · ${cubiertos}/${schedule.length} pagados`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlanTable
            items={schedule}
            total={total}
            nextSeq={proximo?.seq ?? null}
            pagado={pagado}
          />
          <p className="text-xs text-muted-foreground">
            Plan sugerido (guía). Registra los pagos reales en
            {' “Abonos y recibo”.'}
          </p>
          {!cancelled &&
            (tienePagos ? (
              <p className="text-xs text-muted-foreground">
                El plan ya tiene pagos vinculados: no se puede quitar ni
                modificar.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQuitar}
                disabled={isRemoving}
              >
                {isRemoving ? 'Quitando…' : 'Quitar plan'}
              </Button>
            ))}
        </CardContent>
      </Card>
    )
  }

  // ── Estado 1: sin plan — configurar y previsualizar ───────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de pagos</CardTitle>
        <CardDescription>
          El cliente puede pagar de contado, o a plazos: un enganche hoy más
          abonos hasta la fecha final.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="plan-frecuencia">Frecuencia</Label>
            <NativeSelect
              id="plan-frecuencia"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as FrecuenciaPlan)}
            >
              {FRECUENCIAS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-enganche">Enganche %</Label>
            <Input
              id="plan-enganche"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step="1"
              value={pctStr}
              onChange={(e) => setPctStr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-final">Fecha final</Label>
            <Input
              id="plan-final"
              type="date"
              value={finalDate}
              onChange={(e) => setFinalDate(e.target.value)}
            />
          </div>
        </div>

        {!pctValido && (
          <p className="text-xs text-destructive">
            El enganche debe estar entre 1% y 99%.
          </p>
        )}
        {pctValido && finalDate === '' && (
          <p className="text-sm text-muted-foreground">
            Elige la fecha final para calcular el plan.
          </p>
        )}

        {calculando && (
          <p className="text-sm text-muted-foreground">Calculando plan…</p>
        )}
        {currentError && (
          <p role="alert" className="text-sm text-destructive">
            {currentError}
          </p>
        )}
        {currentPlan && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Enganche {mxn.format(currentPlan.enganche)} hoy +{' '}
              {currentPlan.num_abonos} abonos de{' '}
              {mxn.format(currentPlan.monto_abono)} ·{' '}
              {FRECUENCIA_LABELS[currentPlan.frecuencia] ??
                currentPlan.frecuencia}
            </p>
            <PlanTable items={currentPlan.items} total={currentPlan.total} />
          </div>
        )}

        <Button
          type="button"
          onClick={handleCrear}
          disabled={isCreating || currentPlan == null}
        >
          {isCreating ? 'Creando…' : 'Crear plan de pagos'}
        </Button>
      </CardContent>
    </Card>
  )
}
