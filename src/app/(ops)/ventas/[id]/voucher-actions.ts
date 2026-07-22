'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// F4: emisión del voucher de servicio. emit_voucher (INVOKER, idempotente)
// devuelve el uuid del voucher (existente o nuevo). Archivo aparte para no
// tocar ventas/[id]/actions.ts (del otro agente).
export async function emitirVoucher(
  bookingId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  const { data, error } = await supabase.rpc('emit_voucher' as never, {
    p_booking_id: bookingId,
  } as never)
  if (error || !data) {
    return { error: safeError(error, 'No se pudo emitir el voucher.') }
  }
  revalidatePath(`/ventas/${bookingId}`)
  return { id: data as unknown as string }
}
