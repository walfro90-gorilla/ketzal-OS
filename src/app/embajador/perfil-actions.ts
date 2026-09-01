'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// El embajador edita SU nombre, teléfono y foto. `profiles` es RPC-only-write
// (b017), así que va por `update_my_profile` (b083), que solo toca esas tres
// columnas de la fila propia — nunca rol, tipo, agencia ni código de referido.
//
// Hasta b083 no existía ningún camino: `register_traveler` trae
// `where profiles.type = 'viajero'`, así que para un embajador era un no-op
// silencioso y encima nunca tocaba la foto.

export async function guardarMiPerfil(input: {
  nombre?: string | null
  telefono?: string | null
  /** URL en el bucket `ketzal-assets`; el RPC rechaza cualquier otra. */
  imagen?: string | null
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  const nombre = input.nombre?.trim()
  if (nombre !== undefined && nombre !== null && nombre.length > 0 && nombre.length < 2) {
    return { error: 'Escribe tu nombre completo.' }
  }

  const { error } = await supabase.rpc('update_my_profile' as never, {
    p_name: nombre || null,
    p_phone: input.telefono ?? null,
    p_image: input.imagen ?? null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo guardar tu perfil.') }

  revalidatePath('/embajador')
  return { ok: true }
}
