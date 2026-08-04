'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b052: liquidar el saldo de una cuenta contra la plataforma (el dinero real
// se movió por fuera — SPEI/efectivo—; esto cierra el saldo en el ledger).
// Guard superadmin en el RPC.
export async function liquidarCuenta(input: {
  accountType: string
  supplierId?: string | null
  profileId?: string | null
  amount?: number | null
  note?: string
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('settle_ledger' as never, {
    p_account_type: input.accountType,
    p_supplier: input.supplierId ?? null,
    p_profile: input.profileId ?? null,
    p_amount: input.amount ?? null,
    p_note: input.note?.trim() || null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo liquidar.') }
  revalidatePath('/cuentas')
  return { ok: true }
}
