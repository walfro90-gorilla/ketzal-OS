// Gráficas del reporte, renderizadas en el servidor (sin JS de cliente).
// SVG inline autocontenido (CSP-safe): sin librerías ni assets remotos.
// Texto y rejilla usan tokens del tema (fill-*/stroke-* de Tailwind) para
// funcionar en claro y oscuro; el único color fijo es el teal de marca.
import { mxn } from '../ventas/ui'
import type { PorMes } from './tipos'

/** Teal Ketzal: contraste ≥ 3:1 sobre superficie clara y oscura (validado). */
const TEAL = '#009E7E'

const mxnCompacto = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const mesCortoFmt = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  year: '2-digit',
})

const mesLargoFmt = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  year: 'numeric',
})

/** "2026-07" → Date a mediodía (evita corrimiento por zona horaria). */
function mesADate(mes: string): Date | null {
  const d = new Date(`${mes}-01T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatMes(mes: string, fmt: Intl.DateTimeFormat): string {
  const d = mesADate(mes)
  return d ? fmt.format(d) : mes
}

/** Paso "bonito" (1/2/2.5/5 × 10^k) para los ticks del eje Y. */
function pasoBonito(bruto: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(bruto)))
  const frac = bruto / pow
  if (frac <= 1) return pow
  if (frac <= 2) return 2 * pow
  if (frac <= 2.5) return 2.5 * pow
  if (frac <= 5) return 5 * pow
  return 10 * pow
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Barra vertical con extremo superior redondeado (4px) y base recta. */
function barraPath(x: number, yTop: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  const yBase = r1(yTop + h)
  return [
    `M${r1(x)},${yBase}`,
    `L${r1(x)},${r1(yTop + r)}`,
    `Q${r1(x)},${r1(yTop)} ${r1(x + r)},${r1(yTop)}`,
    `L${r1(x + w - r)},${r1(yTop)}`,
    `Q${r1(x + w)},${r1(yTop)} ${r1(x + w)},${r1(yTop + r)}`,
    `L${r1(x + w)},${yBase}`,
    'Z',
  ].join('')
}

/**
 * Barras verticales de lo vendido por mes. Serie única (teal de marca),
 * sin leyenda: el título de la tarjeta ya nombra la serie. Si hay muchos
 * meses, hace scroll horizontal dentro de su propio contenedor.
 */
export function GraficaMensual({ data }: { data: PorMes[] }) {
  const meses = data
    .map((m) => ({
      mes: m.mes,
      num: Number(m.num ?? 0),
      vendido: Number(m.vendido ?? 0),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const max = Math.max(0, ...meses.map((m) => m.vendido))
  if (meses.length === 0 || max <= 0) return null

  // Escala Y con ticks redondos (~4 divisiones).
  const paso = pasoBonito(max / 4)
  const nTicks = Math.ceil(max / paso)
  const tope = paso * nTicks
  const ticks: number[] = []
  for (let i = 0; i <= nTicks; i++) ticks.push(i * paso)

  // Geometría. La altura incluye la banda de etiquetas del eje X.
  const PAD_LEFT = 52
  const PAD_RIGHT = 12
  const PAD_TOP = 18
  const PAD_BOTTOM = 26
  const PLOT_H = 160
  const SLOT_W = 56
  const BAR_W = 24
  const width = PAD_LEFT + meses.length * SLOT_W + PAD_RIGHT
  const height = PAD_TOP + PLOT_H + PAD_BOTTOM
  const gridX2 = width - PAD_RIGHT

  const yDe = (v: number) => PAD_TOP + PLOT_H - (v / tope) * PLOT_H

  // Etiqueta directa solo en el mes más alto (selectiva, no en cada barra).
  const iMax = meses.findIndex((m) => m.vendido === max)

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfica de barras de lo vendido por mes; el detalle está en la tabla siguiente"
        className="shrink-0"
      >
        {/* Rejilla: líneas finas y sólidas, un paso fuera de la superficie */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={gridX2}
              y1={r1(yDe(t))}
              y2={r1(yDe(t))}
              className="stroke-border"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={PAD_LEFT - 8}
              y={r1(yDe(t)) + 3}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground tabular-nums"
            >
              {mxnCompacto.format(t)}
            </text>
          </g>
        ))}

        {/* Barras + etiquetas de mes */}
        {meses.map((m, i) => {
          const cx = PAD_LEFT + i * SLOT_W + SLOT_W / 2
          const h = Math.max(2, (m.vendido / tope) * PLOT_H)
          const yTop = PAD_TOP + PLOT_H - h
          return (
            <g key={m.mes}>
              {m.vendido > 0 && (
                <path d={barraPath(cx - BAR_W / 2, yTop, BAR_W, h)} fill={TEAL}>
                  <title>
                    {`${formatMes(m.mes, mesLargoFmt)} · ${mxn.format(m.vendido)} · ${
                      m.num === 1 ? '1 venta' : `${m.num} ventas`
                    }`}
                  </title>
                </path>
              )}
              {i === iMax && (
                <text
                  x={cx}
                  y={r1(yTop - 6)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  className="fill-foreground"
                >
                  {mxnCompacto.format(m.vendido)}
                </text>
              )}
              <text
                x={cx}
                y={PAD_TOP + PLOT_H + 16}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground"
              >
                {formatMes(m.mes, mesCortoFmt)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export type BarraItem = {
  /** Clave estable de la fila. */
  clave: string
  etiqueta: string
  /** Monto en MXN; el ancho de la barra es proporcional a este valor. */
  valor: number
  /** Detalle extra para el tooltip nativo (title). */
  detalle?: string
}

/**
 * Lista de barras horizontales (top N por valor, descendente).
 * Ancho proporcional al máximo; etiqueta + monto MXN por fila.
 */
export function BarrasTop({
  items,
  top = 8,
}: {
  items: BarraItem[]
  top?: number
}) {
  const ordenados = items
    .filter((i) => Number(i.valor) > 0)
    .sort((a, b) => Number(b.valor) - Number(a.valor))
  const visibles = ordenados.slice(0, top)
  if (visibles.length === 0) return null

  const max = Number(visibles[0].valor)

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {visibles.map((item) => {
          const valor = Number(item.valor)
          const pct = Math.max(2, (valor / max) * 100)
          return (
            <li
              key={item.clave}
              className="space-y-1"
              title={item.detalle ?? `${item.etiqueta}: ${mxn.format(valor)}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{item.etiqueta}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {mxn.format(valor)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: TEAL }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {ordenados.length > visibles.length && (
        <p className="text-xs text-muted-foreground">
          Top {visibles.length} de {ordenados.length}; el resto está en la
          tabla.
        </p>
      )}
    </div>
  )
}
