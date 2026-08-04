'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Acciones de asientos (b041), compartidas por viajero y staff — el guard dual
// (dueño del pedido / staff de la agencia) vive en los RPCs DEFINER. La
// carrera por el mismo asiento la decide el unique de la BD (error amigable).

export type SeatMapData = {
  enabled: boolean
  transport_type?: 'autobus' | 'sprinter' | 'van' | 'avion'
  total?: number
  occupied?: number[]
  mine?: { passenger_id: string; seat: number }[]
}

export async function asignarAsiento(
  bookingId: string,
  passengerId: string,
  seat: number
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('assign_seat' as never, {
    p_passenger_id: passengerId,
    p_seat: seat,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo asignar el asiento.') }
  revalidatePath(`/mis-compras/${bookingId}`)
  revalidatePath(`/ventas/${bookingId}`)
  return { ok: true }
}

export async function liberarAsiento(
  bookingId: string,
  passengerId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_seat' as never, {
    p_passenger_id: passengerId,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo liberar el asiento.') }
  revalidatePath(`/mis-compras/${bookingId}`)
  revalidatePath(`/ventas/${bookingId}`)
  return { ok: true }
}
