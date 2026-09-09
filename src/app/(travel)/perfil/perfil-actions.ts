'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

export type PerfilViajeroInput = {
  nombre: string
  telefono: string
  apodo: string
  viajeSonado: string
  bio: string
  ciudad: string
  publico: boolean
}

/**
 * Guarda el perfil social del viajero. `profiles` es RPC-only-write (b017): la
 * escritura pasa por `update_my_traveler_profile` (DEFINER, gateado a viajero).
 * `is_public` es el opt-in — apagado por default; Fase 2 lo lee para mostrar el
 * perfil a los compañeros de viaje.
 */
export async function guardarPerfilViajero(
  input: PerfilViajeroInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para editar tu perfil.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('update_my_traveler_profile', {
    p_full_name: input.nombre?.trim() || null,
    p_phone: input.telefono?.trim() || null,
    p_nickname: input.apodo?.trim() || null,
    p_dream_trip: input.viajeSonado?.trim() || null,
    p_bio: input.bio?.trim() || null,
    p_city: input.ciudad?.trim() || null,
    p_is_public: input.publico,
  })
  if (error) return { error: safeError(error, 'No se pudo guardar el perfil.') }

  revalidatePath('/perfil')
  return { ok: true }
}
