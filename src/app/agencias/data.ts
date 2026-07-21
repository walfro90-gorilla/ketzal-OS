import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type PublicSupplierCard = {
  id: string
  name: string
  logo: string | null
  city_zone: string | null
  specialties: string[]
  active_trips: number
  /** Rating agregado (viene del RPC; {count:0,avg:0} si no hay reseñas). */
  rating: { count: number; avg: number }
}

// Directorio público de agencias: list_public_suppliers (SECURITY DEFINER, anon).
// Solo agencias con >=1 servicio publicado. Error ⇒ lista vacía (fail-safe).
export const listPublicSuppliers = cache(
  async (): Promise<PublicSupplierCard[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('list_public_suppliers' as never)
    if (error || data == null) return []
    return data as unknown as PublicSupplierCard[]
  }
)

