import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type PublicSupplierCard = {
  id: string
  name: string
  logo: string | null
  city_zone: string | null
  specialties: string[]
  active_trips: number
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

export type AgencyRating = { count: number; avg: number }

/** Rating por agencia para las tarjetas del directorio. Reusa get_service_reviews
 *  (hereda sus reglas de visibilidad); cada servicio se consulta una sola vez.
 *  App-side, sin cambios de BD. A escala conviene un RPC agregado dedicado. */
export const getAgencyRatings = cache(
  async (
    agencies: { id: string; serviceIds: string[] }[]
  ): Promise<Record<string, AgencyRating>> => {
    const supabase = await createClient()
    const allIds = [...new Set(agencies.flatMap((a) => a.serviceIds))]
    const byService: Record<string, { count: number; avg: number }> = {}
    await Promise.all(
      allIds.map(async (sid) => {
        const { data } = await supabase.rpc('get_service_reviews' as never, {
          p_service_id: sid,
        } as never)
        const r = data as unknown as { count?: number; avg?: number } | null
        byService[sid] = { count: r?.count ?? 0, avg: r?.avg ?? 0 }
      })
    )
    const out: Record<string, AgencyRating> = {}
    for (const a of agencies) {
      let total = 0
      let ponderado = 0
      for (const sid of a.serviceIds) {
        const r = byService[sid]
        if (r && r.count > 0) {
          total += r.count
          ponderado += r.avg * r.count
        }
      }
      out[a.id] = {
        count: total,
        avg: total ? Math.round((ponderado / total) * 10) / 10 : 0,
      }
    }
    return out
  }
)
