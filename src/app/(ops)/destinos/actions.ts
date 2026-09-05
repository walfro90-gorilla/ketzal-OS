'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// ADR-0053: contenido editorial de los destinos públicos. Lo administra el
// superadmin; la RLS de `ketzal.destinos` es la que manda (policy
// `destinos_admin_write` con `coalesce(is_superadmin(), false)`), así que estas
// acciones NO son la puerta de seguridad — son la puerta de uso. Aun así se
// verifica el rol aquí para dar un error legible en vez de un fallo de RLS.

export type DestinoInput = {
  slug: string
  nombre: string
  estado?: string | null
  pais?: string | null
  lat?: number | null
  lng?: number | null
  ubicacion?: string | null
  como_llegar?: string | null
  por_que?: string | null
  cuando_ir?: string | null
  /** Una entrada por renglón en el textarea; se guarda como arreglo. */
  que_visitar?: string[]
  publicado?: boolean
}

async function soloSuperadmin(): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'superadmin') {
    return { error: 'Solo el god admin edita los destinos públicos.' }
  }
  return null
}

/** Texto vacío se guarda como null: `''` en la BD miente sobre "no hay dato". */
const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export async function guardarDestino(
  input: DestinoInput
): Promise<{ error: string } | { ok: true }> {
  const noAutorizado = await soloSuperadmin()
  if (noAutorizado) return noAutorizado

  const slug = limpio(input.slug)
  const nombre = limpio(input.nombre)
  if (!slug) return { error: 'Falta el identificador del destino.' }
  if (!nombre) return { error: 'El destino necesita nombre.' }

  // Coordenadas: o las dos o ninguna. Media coordenada saca el punto del mapa
  // sin que nadie lo note en el formulario (la BD también lo rechaza).
  const lat = input.lat ?? null
  const lng = input.lng ?? null
  if ((lat == null) !== (lng == null)) {
    return { error: 'Pon latitud y longitud, o deja las dos vacías.' }
  }

  const supabase = await createClient()
  // `destinos` no está en los tipos generados (convención: cast `as never`).
  const { error } = await supabase.from('destinos' as never).upsert(
    {
      slug,
      nombre,
      estado: limpio(input.estado),
      pais: limpio(input.pais) ?? 'México',
      lat,
      lng,
      ubicacion: limpio(input.ubicacion),
      como_llegar: limpio(input.como_llegar),
      por_que: limpio(input.por_que),
      cuando_ir: limpio(input.cuando_ir),
      que_visitar: (input.que_visitar ?? []).map((q) => q.trim()).filter(Boolean),
      publicado: Boolean(input.publicado),
    } as never,
    { onConflict: 'slug' } as never
  )
  if (error) return { error: safeError(error) }

  revalidatePath('/destinos')
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${slug}`)
  return { ok: true }
}

export async function borrarDestino(
  slug: string
): Promise<{ error: string } | { ok: true }> {
  const noAutorizado = await soloSuperadmin()
  if (noAutorizado) return noAutorizado

  const supabase = await createClient()
  const { error } = await supabase.from('destinos' as never).delete().eq('slug', slug)
  if (error) return { error: safeError(error) }

  revalidatePath('/destinos')
  revalidatePath('/viajes')
  revalidatePath(`/viajes/${slug}`)
  return { ok: true }
}
