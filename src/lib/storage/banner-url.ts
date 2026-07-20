// Un banner de servicio SOLO puede ser una URL pública del propio Storage
// (bucket `gorilla-assets`), nunca una URL arbitraria. Esto cierra un SSRF:
// `setServicioImagen` es invocable directo (no solo desde la UI) y el OG de la
// ficha (`next/og`) fetchea la URL server-side para renderizar la imagen; una
// URL a un host interno sería una petición server-side a un destino no
// confiable. Se usa como gate de escritura y como defensa en profundidad en el
// sink (el OG). Fuente única para no divergir entre ambos.

const PREFIJO_PUBLICO = '/storage/v1/object/public/gorilla-assets/'

export function esBannerValido(raw: string | null | undefined): boolean {
  if (!raw) return false
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return false
  let u: URL
  let host: string
  try {
    u = new URL(raw)
    host = new URL(base).host
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    u.host === host &&
    u.pathname.startsWith(PREFIJO_PUBLICO)
  )
}
