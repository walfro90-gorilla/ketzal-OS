import { StarIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ServiceReviews } from './data'

// Estrellas 1-5 (llenas hasta `value`, redondeado). Presentacional.
function Estrellas({ value, className = 'size-4' }: { value: number; className?: string }) {
  const llenas = Math.round(value)
  return (
    <span className="inline-flex" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={`${className} ${n <= llenas ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  )
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Reseñas públicas del viaje (viajero→proveedor). Terreno del sistema de
// calificaciones post-viaje; se muestra tras el flag del marketplace.
export function Resenas({ reviews }: { reviews: ServiceReviews }) {
  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Reseñas de viajeros</CardTitle>
        {reviews.count > 0 && (
          <span className="flex items-center gap-1.5 text-sm">
            <Estrellas value={reviews.avg} />
            <span className="font-semibold tabular-nums">{reviews.avg}</span>
            <span className="text-muted-foreground">({reviews.count})</span>
          </span>
        )}
      </CardHeader>
      <CardContent>
        {reviews.count === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay reseñas. Sé el primero en calificar este viaje.
          </p>
        ) : (
          <ul className="space-y-4">
            {reviews.items.map((r, i) => (
              <li key={i} className="border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.autor}</span>
                  <Estrellas value={r.rating} className="size-3.5" />
                </div>
                {r.comment && (
                  <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{fecha(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
