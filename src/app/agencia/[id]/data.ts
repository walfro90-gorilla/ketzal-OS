import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Perfil público de la agencia (info jsonb capturado en el form de proveedor). */
export type SupplierInfo = {
  about?: string
  city_zone?: string
  founded_year?: number
  website?: string
  instagram?: string
  facebook?: string
  specialties?: string[]
  /** Kilómetros recorridos — estimado inicial que captura el fundador (seed). */
  km_traveled?: number
}

export type PublicSupplierTrip = {
  id: string
  name: string
  price: number | null
  image: string | null
  city_to: string | null
  state_to: string | null
}

export type PublicSupplier = {
  id: string
  name: string
  logo: string | null
  photos: string[]
  info: SupplierInfo
  /** Servicios publicados (métrica real). */
  active_trips: number
  /** Destinos distintos entre los servicios publicados. */
  destinations: string[]
  trips: PublicSupplierTrip[]
}

// Perfil público: get_public_supplier (SECURITY DEFINER, anon, solo si el
// proveedor tiene >=1 servicio publicado). id inválido / sin publicados ⇒ null.
export const getPublicSupplier = cache(
  async (id: string): Promise<PublicSupplier | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_supplier' as never, {
      p_id: id,
    } as never)
    if (error || data == null) return null
    return data as unknown as PublicSupplier
  }
)

/** Reseña individual (viajero→proveedor) más el viaje al que pertenece. */
export type SupplierReviewItem = {
  rating: number
  comment: string | null
  autor: string
  created_at: string
  serviceId: string
  serviceName: string
}

/** Rating agregado + reseñas recientes de la agencia. Reusa get_service_reviews
 *  (RPC del sistema de calificaciones) por servicio → hereda exacto sus reglas
 *  de visibilidad. Sin cambios de BD. A escala conviene un RPC agregado; con
 *  pocos viajes por agencia esto basta. */
export type SupplierReviews = {
  count: number
  avg: number
  recent: SupplierReviewItem[]
}

type RpcServiceReviews = {
  count?: number
  avg?: number
  items?: {
    rating: number
    comment: string | null
    autor: string
    created_at: string
  }[]
}

export const getSupplierReviews = cache(
  async (
    trips: { id: string; name: string }[]
  ): Promise<SupplierReviews> => {
    if (trips.length === 0) return { count: 0, avg: 0, recent: [] }
    const supabase = await createClient()
    const porServicio = await Promise.all(
      trips.map(async (t) => {
        const { data } = await supabase.rpc('get_service_reviews' as never, {
          p_service_id: t.id,
        } as never)
        return { trip: t, r: (data as unknown as RpcServiceReviews | null) ?? null }
      })
    )
    let total = 0
    let ponderado = 0
    const recent: SupplierReviewItem[] = []
    for (const { trip, r } of porServicio) {
      if (r && r.count && r.count > 0) {
        total += r.count
        ponderado += (r.avg ?? 0) * r.count
        for (const it of r.items ?? []) {
          recent.push({ ...it, serviceId: trip.id, serviceName: trip.name })
        }
      }
    }
    recent.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return {
      count: total,
      avg: total ? Math.round((ponderado / total) * 10) / 10 : 0,
      recent: recent.slice(0, 6),
    }
  }
)
