import { cn } from '@/lib/utils'

// Barras de porcentaje horizontales, server-rendered con divs. Las usan la
// encuesta pública (/opina) y su detalle en el OS (/investigacion). Sin SVG ni
// librería de gráficas: es una lista ordenada, no una serie de tiempo.

export type Barra = { label: string; votes: number }

export function BarrasPorcentaje({
  datos,
  total,
  className,
  vacio = 'Todavía no hay votos.',
}: {
  datos: Barra[]
  total: number
  className?: string
  vacio?: string
}) {
  if (!datos.length || total <= 0) {
    return <p className="text-sm text-muted-foreground">{vacio}</p>
  }
  return (
    <ul className={cn('space-y-3', className)}>
      {datos.map((d, i) => {
        const pct = Math.round((d.votes / total) * 100)
        return (
          // Índice y no `label`: dos destinos pueden llamarse igual, y los
          // option_id desconocidos colapsan todos a "Otro".
          <li key={`${i}-${d.label}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{d.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {d.votes} · {pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', i === 0 ? 'bg-estela' : 'bg-primary/50')}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
