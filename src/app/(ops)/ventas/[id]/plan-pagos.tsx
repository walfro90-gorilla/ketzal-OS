'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
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
import { formatTravelDate, mxn } from '../ui'
import {
  crearPlanPagos,
  previewPlanPagos,
  quitarPlanPagos,
  type FrecuenciaPlan,
} from './actions'

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
}: {
  items: PlanItem[]
  total: number
  /** seq del próximo pago a resaltar (null = sin resaltado, p. ej. en preview). */
  nextSeq?: number | null
}) {
  // Saldo tras la fila i = total − suma de montos hasta i (cálculo puro:
  // la regla react-hooks/immutability prohíbe mutar acumuladores en render).
  const rows = items.map((item, i) => ({
    ...item,
    saldo:
      total -
      items.slice(0, i + 1).reduce((sum, it) => sum + Number(it.amount), 0),
  }))

  // Columnas dentro del componente para cerrar sobre `nextSeq` (resaltado del
  // próximo pago). El tinte de fila del desktop lo reemplaza el badge "Próximo",
  // que en las tarjetas móviles también marca la fila accionable.
  const columns: DataColumn<(typeof rows)[number]>[] = [
    {
      header: 'Concepto',
      primary: true,
      cell: (row) =>
        row.kind === 'enganche' ? 'Enganche' : `Abono ${row.seq}`,
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
      cell: (row) => (
        <span className="tabular-nums">{mxn.format(Number(row.amount))}</span>
      ),
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
}) {
  const hasPlan = paymentType === 'abonos' && schedule.length > 0

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

  // Cancelada y sin plan: no hay nada que configurar ni mostrar.
  if (cancelled && !hasPlan) return null

  // ── Estado 2: ya hay plan guardado ────────────────────────────────────
  if (hasPlan) {
    const enganche = schedule.find((s) => s.kind === 'enganche')
    const numAbonos = schedule.filter((s) => s.kind === 'abono').length
    const today = hoy()
    const proximo = schedule.find((s) => s.due_date >= today)

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
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlanTable
            items={schedule}
            total={total}
            nextSeq={proximo?.seq ?? null}
          />
          <p className="text-xs text-muted-foreground">
            Plan sugerido (guía). Registra los pagos reales en
            {' “Abonos y recibo”.'}
          </p>
          {!cancelled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleQuitar}
              disabled={isRemoving}
            >
              {isRemoving ? 'Quitando…' : 'Quitar plan'}
            </Button>
          )}
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
