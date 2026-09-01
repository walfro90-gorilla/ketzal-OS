import { createClient } from '@/lib/supabase/client'

// Foto del embajador, directo al bucket público `ketzal-assets` desde el
// navegador (carpeta profiles/{id}/). Directo y no vía server action por lo
// mismo que las imágenes de proveedores y servicios: el body de una función en
// Vercel tope en 4.5 MB.
//
// El bucket ya permite INSERT autenticado + lectura pública, y `update_my_profile`
// (b083) solo acepta URLs de este bucket — así la foto del perfil no puede
// apuntar a un pixel de rastreo ni a contenido ajeno que cambie después.

const BUCKET = 'ketzal-assets'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB: es un avatar, no un banner
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function subirFotoPerfil(
  profileId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const ext = TIPOS[file.type]
  if (!ext) return { error: 'Usa una foto JPG, PNG o WebP.' }
  if (file.size > MAX_BYTES) {
    return { error: 'La foto pesa más de 5 MB. Toma una más ligera.' }
  }

  const supabase = createClient()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `profiles/${profileId}/foto-${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) return { error: 'No se pudo subir la foto. Intenta de nuevo.' }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
