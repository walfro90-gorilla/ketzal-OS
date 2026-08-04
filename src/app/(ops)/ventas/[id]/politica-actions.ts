'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// C2 — El agente registra que el cliente aceptó la política por otro canal
// (WhatsApp, verbal, en persona). Queda con canal 'agente' + user_id del
// agente en policy_accepted_meta: rastro de QUIÉN la registró (evidencia
// débil pero honesta; la fuerte es el checkout o la cotización del cliente).
// Archivo aparte para no chocar con actions.ts (convención del carril).

export async function registrarAceptacionAgente(
  bookingId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const h = await headers()
  const { error } = await supabase.rpc('accept_booking_policy' as never, {
    p_booking: bookingId,
    p_canal: 'agente',
    p_meta: { ua: h.get('user-agent')?.slice(0, 300) || null },
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar la aceptación.') }

  revalidatePath(`/ventas/${bookingId}`)
  return { ok: true }
}
