'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { esBannerValido } from '@/lib/storage/banner-url'

/**
 * Guarda / quita el logo oficial (URL pública ya subida a Storage). Escribe
 * app_settings.logo_url. RLS: app_settings_write = is_superadmin() ⇒ solo el
 * superadmin puede; el chequeo de filas afectadas convierte "sin permiso" en
 * error (0 filas). `logo_url` no está en los types ⇒ cast (convención multi-agente).
 */
export async function setLogo(
  url: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clean = url?.trim() || null
  // El logo solo puede ser una URL pública de NUESTRO Storage (mismo gate que el banner).
  if (clean && !esBannerValido(clean)) {
    return { error: 'La URL del logo no es válida.' }
  }

  const { data, error } = await supabase
    .from('app_settings')
    .update({ logo_url: clean } as never)
    .eq('id', 1)
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: safeError(error, 'No se pudo actualizar el logo o no tienes permiso.'),
    }
  }

  // El logo vive en el layout (header) y en login ⇒ revalida todo.
  revalidatePath('/', 'layout')
  revalidatePath('/login')
  return { ok: true }
}
