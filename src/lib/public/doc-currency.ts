import { createClient } from '@/lib/supabase/server'

// Divisa original de un documento público (recibo / cotización / estado). El RPC
// get_public_doc_currency (SECURITY DEFINER, anon) resuelve la venta por el mismo
// token del documento y devuelve datos SOLO si la operación fue en USD; null en
// cualquier otro caso (MXN, sin TC, o no encontrado). Cast del nombre porque los
// RPCs nuevos no viven en database.types.ts (mismo patrón que el resto).

export type DocDivisa = { currency: 'USD'; exchange_rate: number } | null

export async function getDocDivisa(
  kind: 'receipt' | 'quote' | 'statement',
  id: string,
): Promise<DocDivisa> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_doc_currency' as never, {
    p_kind: kind,
    p_id: id,
  } as never)
  if (error || data == null) return null
  return data as unknown as DocDivisa
}
