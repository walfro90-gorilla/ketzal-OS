import Link from 'next/link'
import { CalendarDaysIcon, ChevronRightIcon } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CupoBadge, Plegable, SeccionTitulo } from '@/components/public/ficha-primitivos'
import { formatTravelDate, mxn } from '@/components/data/format'
import { precioDesde } from '@/lib/domain/pricing'
import type { DepartureConPrecio } from './data'

// Calendario de salidas como lista vertical (cero scroll horizontal, filas ≥44px):
// fecha + nota (m001) a la izquierda; temporada/precio especial, cupo y flecha a
// la derecha. Cada fila futura con lugares lleva a /comprar?salida=<id>. Las
// pasadas (b044: señal de actividad) van plegadas para no estorbar en móvil.
export function Salidas({
  departures,
  packsMin,
  price,
  comprarHref,
  comprarOnline,
}: {
  departures: DepartureConPrecio[]
  packsMin: { key: string; price: number }[]
  price: number
  comprarHref: string
  comprarOnline: boolean
}) {
  if (departures.length === 0) return null
  const hoy = new Date().toISOString().slice(0, 10)
  const futuras = departures.filter((d) => d.departs_on >= hoy)
  const pasadas = departures.filter((d) => d.departs_on < hoy)
  const sep = comprarHref.includes('?') ? '&' : '?'

  return (
    <Card className="mt-6">
      <CardHeader>
        <SeccionTitulo icon={CalendarDaysIcon}>Fechas de salida</SeccionTitulo>
      </CardHeader>
      <CardContent>
        {futuras.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin salidas programadas por ahora.</p>
        )}
        <ul className="divide-y">
          {futuras.map((d) => {
            const especial = d.price_pct !== 0 || !!d.pack_price_overrides
            const vendible = comprarOnline && d.free > 0
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{formatTravelDate(d.departs_on)}</p>
                  {d.note && <p className="text-xs leading-4 text-muted-foreground">{d.note}</p>}
                  {especial && d.free > 0 && (
                    <p className="text-xs text-muted-foreground">
                      desde{' '}
                      <b className="tabular-nums">
                        {mxn.format(precioDesde(packsMin, price, d.price_pct, d.pack_price_overrides))}
                      </b>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {especial && d.free > 0 && (
                    <Badge variant="warning">
                      {d.pack_price_overrides
                        ? 'Precio especial'
                        : `Temporada ${d.price_pct > 0 ? '+' : ''}${d.price_pct}%`}
                    </Badge>
                  )}
                  <CupoBadge free={d.free} />
                  {vendible && <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />}
                </div>
              </>
            )
            const cls = 'flex min-h-11 items-center justify-between gap-3 py-3'
            return (
              <li key={d.id}>
                {vendible ? (
                  <Link
                    href={`${comprarHref}${sep}salida=${d.id}`}
                    className={`${cls} -mx-2 rounded-lg px-2 transition-colors hover:bg-muted active:bg-muted`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
        {pasadas.length > 0 && (
          <Plegable titulo={`Salidas anteriores (${pasadas.length})`}>
            <ul className="space-y-1">
              {pasadas.map((d) => (
                <li key={d.id} className="text-muted-foreground/60 line-through">
                  {formatTravelDate(d.departs_on)}
                </li>
              ))}
            </ul>
          </Plegable>
        )}
      </CardContent>
    </Card>
  )
}
