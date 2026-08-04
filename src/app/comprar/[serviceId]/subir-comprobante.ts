import { createClient } from '@/lib/supabase/client'

// Subida del comprobante de transferencia SPEI (b035) directo al bucket público
// `gorilla-assets` (carpeta spei/{bookingId}/) desde el navegador — misma infra
// que las fotos de proveedor (INSERT autenticado + lectura pública; path con
// aleatorio = no adivinable, mismo modelo que /recibo/[uuid]).

const BUCKET = 'gorilla-assets'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function subirComprobanteSpei(
  bookingId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const ext = TIPOS[file.type]
  if (!ext) return { error: 'El comprobante debe ser una imagen JPG, PNG o WebP.' }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen pesa más de 8 MB. Comprímela e intenta de nuevo.' }
  }

  const supabase = createClient()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `spei/${bookingId}/comprobante-${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) return { error: 'No se pudo subir el comprobante. Intenta de nuevo.' }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
