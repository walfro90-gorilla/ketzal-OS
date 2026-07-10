import { createClient } from '@/lib/supabase/server'

export type CobranzaItem = {
  id: string
  cliente: string
  servicio: string
  total: number
  pagado: number
  saldo: number
  con_plan: boolean
  frecuencia: string | null
  proximo_due: string | null
  proximo_monto: number | null
  atrasado: number
  due_date: string | null
  travel_date: string | null
}

export type CobranzaData = {
  total_saldo: number
  total_atrasado: number
  num_ventas: number
  items: CobranzaItem[]
}

const EMPTY: CobranzaData = {
  total_saldo: 0,
  total_atrasado: 0,
  num_ventas: 0,
  items: [],
}

// El RPC `cobranza()` (SECURITY INVOKER, RLS) devuelve jsonb con las ventas con
// saldo, su próximo pago del plan y cuánto van atrasadas vs. el plan.
// Nota: `cobranza` aún no está en los tipos generados a mano (otro flujo edita
// database.types.ts en paralelo); cast puntual del nombre para no tocar ese archivo.
export async function getCobranza(): Promise<CobranzaData> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cobranza' as never)
  if (error || data == null) return EMPTY
  return data as unknown as CobranzaData
}
