'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b092 (ADR-0042): Ketzal borra SU copia de la cuenta MP de la agencia; el guard
// (superadmin o admin activo de esa agencia) vive en el RPC, no aquí.
export async function desconectarMp(
  supplierId: string,
): Promise<{ ok: true; habia: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mp_account_disconnect' as never, {
    p_supplier: supplierId,
  } as never)
  if (error) return { error: safeError(error) }
  revalidatePath(`/proveedores/${supplierId}`)
  return { ok: true, habia: Boolean(data) }
}
