'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { esBannerValido } from '@/lib/storage/banner-url'
import { ALCANCES, type Alcance } from '@/lib/domain/temporadas-mx'

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

/**
 * Qué calendarios de fechas altas ve la agencia (ADR-0058): `nacional` y/o
 * `frontera`. Escribe `suppliers.alcances_temporada` de MI agencia; RLS
 * (`suppliers_update`) exige admin de esa agencia y el CHECK exige al menos uno.
 */
export async function setAlcances(
  alcances: string[]
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const limpios = [...new Set(alcances)].filter((a): a is Alcance =>
    (ALCANCES as readonly string[]).includes(a)
  )
  if (!limpios.length) return { error: 'Elige al menos un calendario.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('supplier_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.supplier_id) return { error: 'Tu usuario no tiene agencia.' }

  const { data, error } = await supabase
    .from('suppliers')
    .update({ alcances_temporada: limpios } as never)
    .eq('id', profile.supplier_id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    return { error: safeError(error, 'No se pudo guardar o no tienes permiso.') }
  }
  revalidatePath('/ajustes')
  revalidatePath('/salidas')
  return { ok: true }
}
