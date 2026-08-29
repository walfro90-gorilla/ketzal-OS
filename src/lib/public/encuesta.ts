import { createClient } from '@/lib/supabase/server'

// Encuesta pública de investigación de mercado (m002). El RPC get_public_poll
// (SECURITY DEFINER, anon) devuelve SOLO agregados: nunca votos individuales ni
// el contacto de los leads. Null si la encuesta no existe o sigue en borrador.
// Cast del nombre: RPC nuevo, fuera de database.types.ts. Calco de doc-policy.ts.

export type PollOption = { id: number; label: string }

export type PublicPoll = {
  id: string
  question: string
  options: PollOption[]
  month_from: string
  month_to: string
  closes_at: string | null
  status_efectivo: 'open' | 'closed'
  agency: { name: string | null; logo: string | null }
  total_votes: number
  by_option: { id: number; votes: number }[]
  by_month: { month: string; votes: number }[]
}

export async function getPublicPoll(id: string): Promise<PublicPoll | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_poll' as never, {
    p_id: id,
  } as never)
  if (error || data == null) return null
  return data as unknown as PublicPoll
}
