'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Guarda la cotización en la cuenta de quien la abrió (b091, ADR-0039). El
 * token es la llave: quien lo tiene se la lleva; el RPC `claim_quote` decide
 * (primer perfil gana, cancelada no, idempotente para el dueño).
 */
export async function reclamarCotizacion(
  token: string
): Promise<{ error: string } | { ok: true; bookingId: string }> {
  if (!UUID_RE.test(token)) return { error: 'Cotización no encontrada.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para guardar la cotización.' }

  const { data, error } = await supabase.rpc('claim_quote' as never, {
    p_token: token,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo guardar la cotización.') }

  revalidatePath('/mis-compras')
  return { ok: true, bookingId: data as unknown as string }
}
