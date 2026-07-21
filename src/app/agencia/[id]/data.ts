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
