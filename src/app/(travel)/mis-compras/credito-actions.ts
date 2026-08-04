'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// C5 (b051) — El viajero aplica SU crédito a SU pedido. Todos los guards
// (titular del crédito, dueño del pedido, misma persona, vigencia, saldos)
// viven en redeem_credit; aquí solo la sesión y el redondeo de UX.

export async function usarMiCredito(
  bookingId: string,
  creditId: string,
  amount: number,
): Promise<{ error: string } | { ok: true; saldoCredito: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'El monto debe ser mayor que 0.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const { data, error } = await supabase.rpc('redeem_credit' as never, {
    p_credit: creditId,
    p_booking: bookingId,
    p_amount: amount,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo aplicar tu crédito.') }

  revalidatePath('/mis-compras')
  return { ok: true, saldoCredito: Number(data) }
}
