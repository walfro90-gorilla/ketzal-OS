// Gráficas del panel, renderizadas en el servidor (sin JS de cliente).
// SVG inline autocontenido (CSP-safe), mismo enfoque que /reportes/graficas.
// Colores validados con el método dataviz (validate_palette) en claro y oscuro;
// el tema se resuelve con clases fill-*/stroke-* + variante dark:.
import { mxn } from '@/components/data/format'
import { barraPath, pasoBonito, r1 } from '../reportes/graficas'

const mxnCompacto = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const diaCortoFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
})

/** "2026-07-19" → "19 jul" (mediodía UTC para evitar corrimiento de zona). */
function formatDia(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? dia : diaCortoFmt.format(d)
}

// ── Serie del periodo: Vendido vs Dinero recibido ────────────────────
// Dos series → leyenda siempre presente. Columnas agrupadas con pocos
// buckets (lectura exacta por día); línea cuando el periodo es largo.

/** Teal Ketzal (Vendido): pasa 3:1 y ΔE vs azul en ambos temas. */
const TEAL = '#009E7E'
// Azul (Dinero recibido): paleta categórica slot 1, paso por tema.
const AZUL_FILL = 'fill-[#2a78d6] dark:fill-[#3987e5]'
const AZUL_STROKE = 'stroke-[#2a78d6] dark:stroke-[#3987e5]'
const AZUL_SWATCH = 'bg-[#2a78d6] dark:bg-[#3987e5]'

export type PuntoSerie = {
  /** Inicio del bucket, "YYYY-MM-DD". */
  dia: string
  vendido: number
  recibido: number
}

function Leyenda({ modo }: { modo: 'barras' | 'linea' }) {
  const swatch =
    modo === 'barras' ? 'h-2.5 w-2.5 rounded-[2px]' : 'h-0.5 w-4 rounded-full'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className={swatch} style={{ backgroundColor: TEAL }} />
        Vendido
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`${swatch} ${AZUL_SWATCH}`} />
        Dinero recibido
      </span>
    </div>
  )
}

/**
 * Vendido vs recibido por bucket (día/semana/mes). Ambas series comparten
 * un solo eje Y en MXN. Tooltip nativo por bucket con las dos cifras.
 */
export function SerieVendidoRecibido({ puntos }: { puntos: PuntoSerie[] }) {
  const max = Math.max(0, ...puntos.map((p) => Math.max(p.vendido, p.recibido)))
  if (puntos.length === 0 || max <= 0) return null

  const modo: 'barras' | 'linea' = puntos.length <= 14 ? 'barras' : 'linea'

  // Escala Y con ticks redondos (~4 divisiones).
  const paso = pasoBonito(max / 4)
  const nTicks = Math.ceil(max / paso)
  const tope = paso * nTicks
  const ticks: number[] = []
  for (let i = 0; i <= nTicks; i++) ticks.push(i * paso)

  const PAD_LEFT = 52
  const PAD_RIGHT = 12
  const PAD_TOP = 18
  const PAD_BOTTOM = 26
  const PLOT_H = 170
  const SLOT_W = modo === 'barras' ? 56 : 30
  const width = PAD_LEFT + puntos.length * SLOT_W + PAD_RIGHT
  const height = PAD_TOP + PLOT_H + PAD_BOTTOM
  const gridX2 = width - PAD_RIGHT
  const yDe = (v: number) => PAD_TOP + PLOT_H - (v / tope) * PLOT_H
  const xDe = (i: number) => PAD_LEFT + i * SLOT_W + SLOT_W / 2

  // Etiquetas del eje X selectivas para que no se encimen.
  const cadaX = Math.max(1, Math.ceil(puntos.length / 8))

  // Etiqueta directa solo en el bucket más alto (selectiva).
  const iMax = puntos.findIndex((p) => Math.max(p.vendido, p.recibido) === max)

  const tooltip = (p: PuntoSerie) =>
    `${formatDia(p.dia)} · Vendido ${mxn.format(p.vendido)} · Recibido ${mxn.format(p.recibido)}`

  const BAR_W = 16
  const GAP = 2

  const linePath = (valor: (p: PuntoSerie) => number) =>
    puntos
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(xDe(i))},${r1(yDe(valor(p)))}`)
      .join('')

  return (
    <div className="space-y-3">
      <Leyenda modo={modo} />
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Gráfica de lo vendido y el dinero recibido en el periodo; los totales están en las tarjetas de arriba"
          className="shrink-0"
        >
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

          {modo === 'barras' ? (
            puntos.map((p, i) => {
              const cx = xDe(i)
              const xVend = cx - BAR_W - GAP / 2
              const xRec = cx + GAP / 2
              const hVend = (p.vendido / tope) * PLOT_H
              const hRec = (p.recibido / tope) * PLOT_H
              return (
                <g key={p.dia}>
                  {p.vendido > 0 && (
                    <path
                      d={barraPath(xVend, PAD_TOP + PLOT_H - hVend, BAR_W, hVend)}
                      fill={TEAL}
                    >
                      <title>{tooltip(p)}</title>
                    </path>
                  )}
                  {p.recibido > 0 && (
                    <path
                      d={barraPath(xRec, PAD_TOP + PLOT_H - hRec, BAR_W, hRec)}
                      className={AZUL_FILL}
                    >
                      <title>{tooltip(p)}</title>
                    </path>
                  )}
                  {i === iMax && (
                    <text
                      x={cx}
                      y={r1(yDe(max) - 6)}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      className="fill-foreground"
                    >
                      {mxnCompacto.format(max)}
                    </text>
                  )}
                  {i % cadaX === 0 && (
                    <text
                      x={cx}
                      y={PAD_TOP + PLOT_H + 16}
                      textAnchor="middle"
                      fontSize={10}
                      className="fill-muted-foreground"
                    >
                      {formatDia(p.dia)}
                    </text>
                  )}
                </g>
              )
            })
          ) : (
            <>
              <path
                d={linePath((p) => p.vendido)}
                fill="none"
                stroke={TEAL}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={linePath((p) => p.recibido)}
                fill="none"
                className={AZUL_STROKE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Marcadores solo en el último punto (anillo del color de la card). */}
              {puntos.length > 0 && (
                <g>
                  <circle
                    cx={r1(xDe(puntos.length - 1))}
                    cy={r1(yDe(puntos[puntos.length - 1].vendido))}
                    r={4}
                    fill={TEAL}
                    className="stroke-card"
                    strokeWidth={2}
                  />
                  <circle
                    cx={r1(xDe(puntos.length - 1))}
                    cy={r1(yDe(puntos[puntos.length - 1].recibido))}
                    r={4}
                    className={`${AZUL_FILL} stroke-card`}
                    strokeWidth={2}
                  />
                </g>
              )}
              {/* Zonas de hover por bucket: el tooltip lista ambas series. */}
              {puntos.map((p, i) => (
                <g key={p.dia}>
                  <rect
                    x={r1(xDe(i) - SLOT_W / 2)}
                    y={PAD_TOP}
                    width={SLOT_W}
                    height={PLOT_H}
                    fill="transparent"
                  >
                    <title>{tooltip(p)}</title>
                  </rect>
                  {i === iMax && (
                    <text
                      x={xDe(i)}
                      y={r1(yDe(max) - 8)}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      className="fill-foreground"
                    >
                      {mxnCompacto.format(max)}
                    </text>
                  )}
                  {i % cadaX === 0 && (
                    <text
                      x={xDe(i)}
                      y={PAD_TOP + PLOT_H + 16}
                      textAnchor="middle"
                      fontSize={10}
                      className="fill-muted-foreground"
                    >
                      {formatDia(p.dia)}
                    </text>
                  )}
                </g>
              ))}
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

// ── Dona (pay) ───────────────────────────────────────────────────────
// Parte-de-un-todo con ≤ 6 rebanadas. La leyenda con cifras es el canal
// confiable (los colores nunca cargan solos la identidad) y hace de vista
// de tabla. Gap de 2px del color de la card entre rebanadas.

export type Rebanada = {
  clave: string
  etiqueta: string
  valor: number
  /** Clase fill-* (con dark:) validada para la rebanada. */
  fillClass: string
  /** Clase bg-* (con dark:) para el swatch de la leyenda. */
  swatchClass: string
  /** Cifra mostrada en la leyenda (default: el valor tal cual). */
  cifra?: string
}

function sectorPath(
  cx: number,
  cy: number,
  r0: number,
  r1n: number,
  a0: number,
  a1: number,
): string {
  const p = (r: number, a: number) => `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`
  const laf = a1 - a0 > Math.PI ? 1 : 0
  return [
    `M${p(r1n, a0)}`,
    `A${r1n},${r1n} 0 ${laf} 1 ${p(r1n, a1)}`,
    `L${p(r0, a1)}`,
    `A${r0},${r0} 0 ${laf} 0 ${p(r0, a0)}`,
    'Z',
  ].join('')
}

/**
 * Dona con cifra al centro y leyenda con valores al lado.
 * Las rebanadas con valor 0 no se dibujan pero sí se listan en la leyenda.
 */
export function Dona({
  items,
  centro,
  centroDetalle,
  ariaLabel,
}: {
  items: Rebanada[]
  /** Cifra grande al centro (total). */
  centro: string
  /** Sub-etiqueta del centro. */
  centroDetalle: string
  ariaLabel: string
}) {
  const total = items.reduce((s, i) => s + i.valor, 0)
  if (total <= 0) return null
  const visibles = items.filter((i) => i.valor > 0)

  const SIZE = 168
  const C = SIZE / 2
  const R1 = 78
  const R0 = 58

  let acc = -Math.PI / 2
  const arcos = visibles.map((i) => {
    const a0 = acc
    const a1 = (acc += (i.valor / total) * 2 * Math.PI)
    return { ...i, a0, a1 }
  })

  const pct = (v: number) => `${Math.round((v / total) * 100)}%`

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={ariaLabel}
        className="shrink-0"
      >
        {visibles.length === 1 ? (
          // Una sola rebanada = anillo completo, en dos mitades porque un
          // solo path de 360° colapsa (mismo fill, sin gap visible).
          <g className={visibles[0].fillClass}>
            <title>{`${visibles[0].etiqueta} · ${visibles[0].cifra ?? visibles[0].valor} · 100%`}</title>
            <path d={sectorPath(C, C, R0, R1, -Math.PI / 2, Math.PI / 2)} />
            <path d={sectorPath(C, C, R0, R1, Math.PI / 2, (3 * Math.PI) / 2)} />
          </g>
        ) : (
          arcos.map((a) => (
            <path
              key={a.clave}
              d={sectorPath(C, C, R0, R1, a.a0, a.a1)}
              className={`${a.fillClass} stroke-card`}
              strokeWidth={2}
              strokeLinejoin="round"
            >
              <title>{`${a.etiqueta} · ${a.cifra ?? a.valor} · ${pct(a.valor)}`}</title>
            </path>
          ))
        )}
        <text
          x={C}
          y={C - 2}
          textAnchor="middle"
          fontSize={22}
          fontWeight={600}
          className="fill-foreground"
        >
          {centro}
        </text>
        <text
          x={C}
          y={C + 16}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted-foreground"
        >
          {centroDetalle}
        </text>
      </svg>

      {/* basis-56: si no caben ≥224px al lado de la dona, la leyenda baja a
          fila completa y las etiquetas no se truncan hasta desaparecer. */}
      <ul
        className="min-w-0 grow basis-56 space-y-2"
        aria-label={`Desglose: ${ariaLabel}`}
      >
        {items.map((i) => (
          <li key={i.clave} className="flex items-baseline gap-2 text-sm">
            <span
              className={`size-2.5 shrink-0 translate-y-px rounded-[2px] ${i.swatchClass}`}
            />
            <span className="min-w-0 flex-1 truncate">{i.etiqueta}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {i.cifra ?? i.valor}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {i.valor > 0 ? pct(i.valor) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
