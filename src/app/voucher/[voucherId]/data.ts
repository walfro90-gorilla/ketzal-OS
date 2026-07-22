import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// get_voucher_public es callable por anon; el uuid del voucher es la única
// llave. Fail-closed: null si no existe o la venta está cancelada. SIN montos.
export type Voucher = {
  agencia: string
  logo: string | null
  email: string | null
  telefono: string | null
  folio: number
  fecha_emision: string // ISO
  cliente: string | null
  servicio: string
  fecha_viaje: string | null
  pax: number
  estado: string
  pasajeros: { full_name: string; passenger_type: string | null }[]
}

// cache(): dedupe entre generateMetadata y el render en un mismo request.
export const getVoucher = cache(
  async (voucherId: string): Promise<Voucher | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_voucher_public' as never, {
      p_id: voucherId,
    } as never)
    if (error || data == null) return null
    return data as unknown as Voucher
  }
)
