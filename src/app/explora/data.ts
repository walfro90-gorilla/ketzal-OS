import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Catálogo público: se lee vía list_public_services (SECURITY DEFINER, anon,
// solo servicios published). El RPC devuelve jsonb ⇒ tipamos y casteamos.
export type PublicServiceCard = {
  id: string
  name: string
  price: number | null
  service_type: string | null
  service_category: string | null
  city_to: string | null
  state_to: string | null
  location: string | null
  image: string | null
  agency: string
}

export const listPublicServices = cache(
  async (): Promise<PublicServiceCard[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('list_public_services' as never)
    if (error || data == null) return []
    return data as unknown as PublicServiceCard[]
  }
)
