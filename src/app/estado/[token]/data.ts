import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
export type StatementAbono = {
  fecha: string
  monto: number
  metodo: string | null
  tipo: 'payment' | 'refund'
}

export type Statement = {
  agencia: string
  logo: string | null
  folio: string
  cliente: string | null
  servicio: string | null
  fecha_viaje: string | null // ISO date "2026-07-30"
  pasajeros: number
  estado: 'draft' | 'reserved' | 'paid' | 'cancelled' | string
  moneda: string // "MXN"
  total: number
  pagado: number
  saldo: number
  due_date: string | null // ISO date
  emitido: string // ISO timestamp
  abonos: StatementAbono[]
}

// cache(): dedupe entre generateMetadata y el render en un mismo request.
// get_statement_by_token es callable por anon; el token uuid es la única llave.
export const getStatement = cache(
  async (token: string): Promise<Statement | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_statement_by_token', {
      p_token: token,
    })
    if (error || data == null) return null
    return data as unknown as Statement
  }
)
