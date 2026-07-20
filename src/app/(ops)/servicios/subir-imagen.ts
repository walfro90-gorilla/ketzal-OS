import { createClient } from '@/lib/supabase/client'

// Subida de imágenes de un servicio (banner y galería) directo al bucket
// público `gorilla-assets` desde el navegador. Directo (no vía server action)
// para no toparse con el tope de 4.5 MB del body de una función en Vercel: las
// fotos de un teléfono pasan ese límite fácil. El bucket ya permite INSERT
// autenticado + lectura pública, así que no hace falta ninguna policy nueva.

const BUCKET = 'gorilla-assets'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type SubidaResultado = { url: string } | { error: string }

/**
 * Sube `file` como imagen del servicio y devuelve su URL pública. `slot` solo
 * distingue el nombre del archivo (banner vs foto de galería). Cada subida usa
 * un nombre único (timestamp + aleatorio) para que la URL siempre sea fresca,
 * sin líos de caché del CDN y sin colisión al subir varias fotos a la vez; el
 * archivo anterior queda huérfano (inofensivo en el bucket público; limpieza
 * en un barrido aparte cuando el volumen lo amerite).
 */
export async function subirImagenServicio(
  serviceId: string,
  file: File,
  slot: 'banner' | 'album' = 'banner'
): Promise<SubidaResultado> {
  const ext = TIPOS[file.type]
  if (!ext) {
    return { error: 'Formato no válido. Usa JPG, PNG o WebP.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen pesa más de 8 MB. Comprímela e intenta de nuevo.' }
  }

  const supabase = createClient()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `services/${serviceId}/${slot}-${Date.now()}-${rand}.${ext}`
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
