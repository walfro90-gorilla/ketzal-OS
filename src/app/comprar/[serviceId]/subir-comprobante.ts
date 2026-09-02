import { createClient } from '@/lib/supabase/client'

// Subida del comprobante de transferencia SPEI (b035) desde el navegador.
//
// b088: vive en el bucket PRIVADO `ketzal-privado`, no en `ketzal-assets`. El
// bucket público servía estas fotos —nombre del titular, banco, monto— a
// cualquiera sin sesión: bastaba listar el bucket. Aquí no hay lectura pública
// que valga; se ve sólo por URL firmada vía `/api/comprobante`, que revalida
// con la RLS de `payment_intents`. La policy de INSERT exige ser el dueño del
// pedido (`ketzal.puedo_subir_comprobante`), así que el path deja de ser el
// guard: ahora lo es la BD.
//
// Sigue siendo subida directa del navegador (no server action) por el tope de
// body de una función en Vercel.

const BUCKET = 'ketzal-privado'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function subirComprobanteSpei(
  bookingId: string,
  file: File
): Promise<{ path: string } | { error: string }> {
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
    upsert: false, // un comprobante es evidencia: no se pisa
  })
  if (error) return { error: 'No se pudo subir el comprobante. Intenta de nuevo.' }

  return { path }
}
