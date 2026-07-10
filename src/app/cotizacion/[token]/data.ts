import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
export type QuoteItem = {
  item_type: string
  passenger_type: string | null
  description: string | null
  qty: number
  unit_price: number
  line_total: number
}

export type QuoteData = {
  id: string
  status: string
  travel_date: string | null
  num_pax: number
  subtotal: number
  discount: number
  total: number
  currency: string
  created_at: string
  agency: {
    name: string
    contact_email: string | null
    phone: string | null
    logo: string | null
  }
  customer: { full_name: string }
  service: { name: string; itinerary?: { title: string; description: string }[] } | null
  items: QuoteItem[]
}

// cache(): dedupe entre generateMetadata y el render de la página en un mismo
// request (el RPC corre una sola vez). El acceso pasa por get_quote_by_token
// (SECURITY DEFINER, callable por anon); el token uuid es la única llave.
export const getQuote = cache(async (token: string): Promise<QuoteData | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_quote_by_token', {
    p_token: token,
  })
  if (error || data == null) return null
  return data as unknown as QuoteData
})
