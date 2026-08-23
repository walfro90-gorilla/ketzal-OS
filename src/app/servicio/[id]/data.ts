import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { PackPriceOverrides } from '@/lib/domain/pricing'

/** b057: salida con % de temporada y, opcional, precios especiales por pack. */
export type DepartureConPrecio = {
  id: string
  departs_on: string
  free: number
  price_pct: number
  pack_price_overrides: PackPriceOverrides | null
  /** m001: nota libre de la salida (horario, punto de reunión, preventa). */
  note: string | null
}

export type PublicService = {
  id: string
  name: string
  description: string | null
  price: number | null
  service_type: string | null
  service_category: string | null
  location: string | null
  city_from: string | null
  state_from: string | null
  city_to: string | null
  state_to: string | null
  size_tour: number | null
  max_capacity: number | null
  current_bookings: number
  images: { imgBanner?: string; imgAlbum?: string[] } | null
  /** Link de video (YouTube/Vimeo), o null. */
  yt_link: string | null
  includes: string[] | null
  excludes: string[] | null
  faqs: { question?: string; answer?: string }[] | null
  itinerary: { title: string; description: string }[] | null
  packs: unknown
  add_ons: unknown
  dates: unknown
  /** Salidas futuras con cupo libre (para el pedido de marketplace). */
  departures: DepartureConPrecio[]
  /** b044: calendario completo (últimos 180 días + futuras, incl. agotadas)
      para la ficha — las vendibles siguen siendo `departures`. */
  all_departures: DepartureConPrecio[]
  agency: {
    id: string
    name: string
    logo: string | null
    email: string | null
    phone: string | null
  }
}

// Ficha pública: get_public_service (SECURITY DEFINER, anon, solo si published).
// uuid inválido / no publicado ⇒ null (fail-closed).
export const getPublicService = cache(
  async (id: string): Promise<PublicService | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_service' as never, {
      p_id: id,
    } as never)
    if (error || data == null) return null
    return data as unknown as PublicService
  }
)

export type ServiceReviews = {
  count: number
  avg: number
  items: { rating: number; comment: string | null; autor: string; created_at: string }[]
}

// Reseñas públicas del servicio (viajero→proveedor) vía get_service_reviews (anon).
export const getServiceReviews = cache(
  async (id: string): Promise<ServiceReviews> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_service_reviews' as never, {
      p_service_id: id,
    } as never)
    if (error || data == null) return { count: 0, avg: 0, items: [] }
    return data as unknown as ServiceReviews
  }
)
