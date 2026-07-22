'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Pasajeros de una venta (F3). Tabla editable con RLS (bp_*): quien maneja la
// venta y está activo puede capturarlos. Se opera la tabla directa (RLS acota);
// no está en database.types.ts ⇒ casts. Archivo aparte de ventas/[id]/actions.ts
// para no chocar con el otro agente.

export type Pasajero = {
  id: string
  full_name: string
  passenger_type: string | null
  doc_id: string | null
}

export async function agregarPasajero(
  bookingId: string,
  input: { full_name: string; passenger_type?: string | null; doc_id?: string | null }
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  const full_name = input.full_name?.trim()
  if (!full_name) return { error: 'Escribe el nombre del pasajero.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('booking_passengers').insert({
    booking_id: bookingId,
    full_name,
    passenger_type: input.passenger_type?.trim() || null,
    doc_id: input.doc_id?.trim() || null,
  })
  if (error) return { error: safeError(error, 'No se pudo agregar el pasajero.') }

  revalidatePath(`/ventas/${bookingId}`)
  return { ok: true }
}

export async function eliminarPasajero(
  id: string,
  bookingId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('booking_passengers')
    .delete()
    .eq('id', id)
  if (error) return { error: safeError(error, 'No se pudo quitar el pasajero.') }

  revalidatePath(`/ventas/${bookingId}`)
  return { ok: true }
}
