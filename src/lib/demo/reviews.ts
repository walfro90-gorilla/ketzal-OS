// Datos de EJEMPLO para previsualizar el sistema de reseñas/rating sin tocar la
// BD ni prender el flag del marketplace. Se activa con `?preview=reviews` en las
// páginas públicas (perfil de agencia, ficha, directorio).
//
// ⚠️ Andamiaje de demostración — quitar cuando el marketplace esté prendido con
// reseñas reales. No se usa en ningún flujo normal (solo si viene el query param).

/** ¿El query param pide el modo demo de reseñas? (`?preview=reviews`) */
export function esDemoReviews(v: string | string[] | undefined): boolean {
  return v === 'reviews'
}

type Muestra = {
  autor: string
  rating: number
  comment: string
  created_at: string
}

const MUESTRAS: Muestra[] = [
  {
    autor: 'María G.',
    rating: 5,
    comment:
      'Todo excelente. El guía súper atento y los paisajes increíbles. 100% recomendado.',
    created_at: '2026-07-14T18:20:00Z',
  },
  {
    autor: 'Carlos R.',
    rating: 5,
    comment:
      'La mejor experiencia de viaje que hemos tenido. Muy organizados y puntuales.',
    created_at: '2026-07-11T15:05:00Z',
  },
  {
    autor: 'Ana L.',
    rating: 4,
    comment:
      'Muy bonito el tour, solo faltó un poco más de tiempo en cada parada.',
    created_at: '2026-07-08T12:40:00Z',
  },
  {
    autor: 'Jorge M.',
    rating: 5,
    comment: 'Seguros, amables y muy profesionales. Repetiremos sin duda.',
    created_at: '2026-07-03T09:30:00Z',
  },
  {
    autor: 'Sofía P.',
    rating: 4,
    comment: 'Buena relación calidad-precio y el transporte muy cómodo.',
    created_at: '2026-06-28T20:15:00Z',
  },
  {
    autor: 'Luis H.',
    rating: 5,
    comment: 'Nos trataron increíble, atentos a cada detalle. ¡Gracias!',
    created_at: '2026-06-22T17:00:00Z',
  },
]

const avgDe = (rs: number[]) =>
  rs.length ? Math.round((rs.reduce((s, r) => s + r, 0) / rs.length) * 10) / 10 : 0

/** Reseñas de ejemplo para la ficha de servicio (shape de get_service_reviews). */
export function demoServiceReviews(): {
  count: number
  avg: number
  items: { rating: number; comment: string | null; autor: string; created_at: string }[]
} {
  const items = MUESTRAS.map((m) => ({
    rating: m.rating,
    comment: m.comment,
    autor: m.autor,
    created_at: m.created_at,
  }))
  return { count: items.length, avg: avgDe(items.map((i) => i.rating)), items }
}

/** Reseñas de ejemplo para el perfil de agencia (rating + recientes por viaje). */
export function demoSupplierReviews(trips: { id: string; name: string }[]): {
  count: number
  avg: number
  recent: {
    rating: number
    comment: string | null
    autor: string
    created_at: string
    serviceId: string
    serviceName: string
  }[]
} {
  const base = trips.length ? trips : [{ id: 'demo', name: 'Viaje de ejemplo' }]
  const recent = MUESTRAS.map((m, i) => ({
    rating: m.rating,
    comment: m.comment,
    autor: m.autor,
    created_at: m.created_at,
    serviceId: base[i % base.length].id,
    serviceName: base[i % base.length].name,
  }))
  return { count: recent.length, avg: avgDe(recent.map((r) => r.rating)), recent }
}

/** Rating de ejemplo para una tarjeta del directorio (varía por índice). */
export function demoRating(seed: number): { count: number; avg: number } {
  const avgs = [4.8, 4.6, 5, 4.7, 4.5]
  return { count: 8 + ((seed * 13) % 40), avg: avgs[seed % avgs.length] }
}
