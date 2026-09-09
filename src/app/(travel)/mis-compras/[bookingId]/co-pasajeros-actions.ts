'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

/** Reportar a un co-pasajero (ADR-0063). El RPC exige compartir salida; reportar
 *  también lo oculta para quien reporta. El admin revisa con list_profile_reports. */
export async function reportarCoPasajero(
  bookingId: string,
  reportadoId: string,
  motivo: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('report_traveler', {
    p_reported_id: reportadoId,
    p_booking_id: bookingId,
    p_reason: motivo?.trim() || null,
  })
  if (error) return { error: safeError(error, 'No se pudo enviar el reporte.') }
  revalidatePath(`/mis-compras/${bookingId}`)
  return { ok: true }
}
