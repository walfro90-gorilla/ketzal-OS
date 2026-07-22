'use server'

import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Emite (o regresa, idempotente) el voucher de servicio del PROPIO viaje del
// comprador vía emit_my_voucher (DEFINER, ownership por marketplace_customer_id).
// Devuelve el id = token público para abrir /voucher/[id].
export async function emitMiVoucher(
  bookingId: string
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const { data, error } = await supabase.rpc('emit_my_voucher' as never, {
    p_booking_id: bookingId,
  } as never)
  if (error || !data) return { error: safeError(error, 'No se pudo generar el voucher.') }
  return { id: data as unknown as string }
}
