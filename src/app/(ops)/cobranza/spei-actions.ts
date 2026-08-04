'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b034: aprobar/rechazar una transferencia SPEI declarada por el comprador.
// El guard (admin de la agencia o superadmin) vive en el RPC. Aprobar corre la
// misma lógica de dinero que MP (abono al ledger, cupo, saldo→paid).
export async function resolverSpei(
  intentId: string,
  aprobar: boolean
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('resolve_spei_payment' as never, {
    p_intent_id: intentId,
    p_approve: aprobar,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo resolver la transferencia.') }
  revalidatePath('/cobranza')
  return { ok: true }
}
