'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

export async function actualizarComision(
  supplierId: string,
  rate: number
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: 'El porcentaje debe estar entre 0 y 100.' }
  }

  // RLS acota el update: solo la propia agencia (o superadmin) puede editarlo.
  const { error } = await supabase
    .from('suppliers')
    .update({ commission_rate: rate })
    .eq('id', supplierId)
  if (error) {
    return { error: safeError(error) }
  }

  revalidatePath('/comisiones')
  return { ok: true }
}
