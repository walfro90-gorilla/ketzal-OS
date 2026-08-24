'use server'

import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b068: el viajero borra su propio pedido de "Mis compras" si sigue 'draft' y
// no tiene ningún rastro de dinero (guard real en el RPC — payments/
// payment_intents) — para que los pedidos abandonados/de prueba no se acumulen.
export async function eliminarPedido(
  bookingId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_my_draft_order' as never, {
    p_booking_id: bookingId,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo eliminar el pedido.') }
  return { ok: true }
}
