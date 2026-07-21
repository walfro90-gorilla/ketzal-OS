import { createClient } from '@/lib/supabase/client'

// Subida de imágenes de un proveedor (logo y fotos) directo al bucket público
// `gorilla-assets` (carpeta suppliers/{id}/) desde el navegador. Directo —no vía
// server action— para no toparse con el tope de 4.5 MB del body de una función
// en Vercel. El bucket ya permite INSERT autenticado + lectura pública.

const BUCKET = 'gorilla-assets'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export type SubidaResultado = { url: string } | { error: string }

/** Sube `file` (logo o foto) y devuelve su URL pública. `slot` solo distingue
 *  el nombre del archivo. Nombre único (timestamp + aleatorio) → URL fresca. */
export async function subirImagenProveedor(
  proveedorId: string,
  file: File,
  slot: 'logo' | 'foto' = 'foto'
): Promise<SubidaResultado> {
  const ext = TIPOS[file.type]
  if (!ext) return { error: 'Formato no válido. Usa JPG, PNG, WebP o SVG.' }
  if (file.size > MAX_BYTES) {
    return { error: 'La imagen pesa más de 8 MB. Comprímela e intenta de nuevo.' }
  }
  // El SVG solo tiene sentido para el logo (una foto SVG es rara).
  if (ext === 'svg' && slot !== 'logo') {
    return { error: 'Las fotos deben ser JPG, PNG o WebP.' }
  }

  const supabase = createClient()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `suppliers/${proveedorId}/${slot}-${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
