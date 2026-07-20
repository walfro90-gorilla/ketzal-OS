import { createClient } from '@/lib/supabase/client'

// Sube el logo oficial al bucket público `gorilla-assets` (carpeta brand/),
// directo del navegador. Devuelve la URL pública. Acepta PNG/SVG/WebP (con
// transparencia). El logo se sirve vía <img src>, así que un SVG es seguro
// (no se inlinea → sin ejecución de scripts).

const BUCKET = 'gorilla-assets'
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB (un logo es chico)
const TIPOS: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
}

export type LogoSubida = { url: string } | { error: string }

export async function subirLogo(file: File): Promise<LogoSubida> {
  const ext = TIPOS[file.type]
  if (!ext) return { error: 'Formato no válido. Usa PNG, SVG o WebP.' }
  if (file.size > MAX_BYTES) {
    return { error: 'El logo pesa más de 4 MB. Comprímelo e intenta de nuevo.' }
  }

  const supabase = createClient()
  const path = `brand/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) return { error: 'No se pudo subir el logo. Intenta de nuevo.' }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
