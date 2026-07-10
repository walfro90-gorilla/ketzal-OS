import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
export type Recibo = {
  agencia: string
  logo: string | null
  email: string | null
  telefono: string | null
  folio: number
  fecha: string // ISO timestamp (issued_at)
  cliente: string | null
  concepto: string
  metodo: string | null
  tipo: 'payment' | 'refund'
  monto: number // monto de ESTE recibo
  total: number // total de la venta
  pagado: number
  saldo: number // puede ser <= 0 (liquidada / a favor)
  moneda: string // 'MXN'
}

// cache(): dedupe entre generateMetadata y el render en un mismo request.
// get_receipt_public es callable por anon; el id uuid es la única llave.
export const getReceipt = cache(
  async (receiptId: string): Promise<Recibo | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_receipt_public', {
      p_receipt_id: receiptId,
    })
    if (error || data == null) return null
    return data as unknown as Recibo
  }
)
