import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

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
  departures: { id: string; departs_on: string; free: number }[]
  agency: {
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
