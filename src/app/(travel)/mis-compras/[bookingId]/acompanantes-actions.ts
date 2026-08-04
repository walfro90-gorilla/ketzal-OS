'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b040: el comprador captura a sus acompañantes (pasajeros) tras el primer
// pago. Guards (propiedad, status, tope num_pax) viven en los RPCs DEFINER;
// escriben en booking_passengers (F3) — el agente los ve en /ventas y en el
// manifiesto de la salida.

export async function agregarAcompanante(input: {
  bookingId: string
  nombre: string
  tipo?: string
  doc?: string
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_my_passenger' as never, {
    p_booking_id: input.bookingId,
    p_full_name: input.nombre,
    p_type: input.tipo?.trim() || null,
    p_doc: input.doc?.trim() || null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo agregar al viajero.') }
  revalidatePath(`/mis-compras/${input.bookingId}`)
  return { ok: true }
}

export async function quitarAcompanante(
  bookingId: string,
  passengerId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_my_passenger' as never, {
    p_passenger_id: passengerId,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo quitar al viajero.') }
  revalidatePath(`/mis-compras/${bookingId}`)
  return { ok: true }
}
