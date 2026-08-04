import { createClient } from '@/lib/supabase/server'

// Política de cancelación de un documento público (cotización / estado). El RPC
// get_public_doc_policy (SECURITY DEFINER, anon) resuelve la venta por el mismo
// token del documento y devuelve el snapshot congelado (o la política vigente si
// la venta aún no tiene snapshot) + si ya fue aceptada. Null si el token no
// existe o la venta está cancelada. Cast del nombre: RPC nuevo, fuera de
// database.types.ts (convención multi-agente). Calco de doc-currency.ts.

export type PolicyTramo = { dias_min: number; retencion_pct: number }

export type CancellationPolicy = {
  version?: number
  tramos?: PolicyTramo[]
  no_show_pct?: number
  piso_enganche?: boolean
  credito?: { pct?: number; vigencia_meses?: number }
  cambio_fecha?: { gratis_primero?: boolean; aviso_min_dias?: number }
}

export type DocPolicy = {
  policy: CancellationPolicy | null
  es_snapshot: boolean
  accepted_at: string | null
} | null

export async function getDocPolicy(
  kind: 'quote' | 'statement',
  id: string,
): Promise<DocPolicy> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_public_doc_policy' as never, {
    p_kind: kind,
    p_id: id,
  } as never)
  if (error || data == null) return null
  return data as unknown as DocPolicy
}
