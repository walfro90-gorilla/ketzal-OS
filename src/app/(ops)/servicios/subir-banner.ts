import { createClient } from '@/lib/supabase/client'

// Subida del banner de un servicio directo al bucket público `gorilla-assets`
// desde el navegador. Directo (no vía server action) para no toparse con el
// tope de 4.5 MB del body de una función en Vercel: las fotos de un teléfono
// pasan ese límite fácil. El bucket ya permite INSERT autenticado + lectura
// pública, así que no hace falta ninguna policy nueva.

const BUCKET = 'gorilla-assets'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type SubidaResultado = { url: string } | { error: string }

/**
 * Sube `file` como banner del servicio y devuelve su URL pública.
 * Cada subida usa un nombre único (timestamp) para que la URL siempre sea
 * fresca y no haya que lidiar con caché del CDN; el archivo anterior queda
 * huérfano (inofensivo en el bucket público; se limpiará en un barrido aparte
 * cuando el volumen lo amerite).
 */
export async function subirBannerServicio(
  serviceId: string,
  file: File
): Promise<SubidaResultado> {
  const ext = TIPOS[file.type]
  if (!ext) {
    return { error: 'Formato no válido. Usa JPG, PNG o WebP.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen pesa más de 8 MB. Comprímela e intenta de nuevo.' }
  }

  const supabase = createClient()
  const path = `services/${serviceId}/banner-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) {
    return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
