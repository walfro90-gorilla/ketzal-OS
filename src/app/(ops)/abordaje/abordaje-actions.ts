'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b043: marcar/desmarcar abordaje. Guard staff-only en el RPC (el comprador
// no se auto-aborda). Idempotente: re-abordar conserva la hora original.
export async function marcarAbordaje(
  voucherId: string,
  passengerId: string,
  board: boolean
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('board_passenger' as never, {
    p_passenger_id: passengerId,
    p_board: board,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar el abordaje.') }
  revalidatePath(`/abordaje/${voucherId}`)
  return { ok: true }
}
