import { createClient } from '@/lib/supabase/client'

// Foto del perfil social del viajero: bucket PRIVADO (ketzal-privado), no el
// público. Subida directa del navegador (el tope de body de Vercel). La policy
// de INSERT exige que el segundo segmento de la ruta sea tu propio uid, así que
// nadie sube a la carpeta de otro. Se sirve sólo por URL firmada del servidor.
const BUCKET = 'ketzal-privado'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function subirFotoPerfilSocial(
  file: File
): Promise<{ path: string } | { error: string }> {
  const ext = TIPOS[file.type]
  if (!ext) return { error: 'La foto debe ser JPG, PNG o WebP.' }
  if (file.size > MAX_BYTES) {
    return { error: 'La foto pesa más de 5 MB. Comprímela e intenta de nuevo.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para subir tu foto.' }

  const rand = Math.random().toString(36).slice(2, 8)
  const path = `profiles/${user.id}/social-${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: 'No se pudo subir la foto. Intenta de nuevo.' }
  return { path }
}
