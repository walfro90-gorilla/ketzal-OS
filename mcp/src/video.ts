/**
 * Valida el link de video de un servicio (YouTube o Vimeo).
 *
 * **Espejo de `src/lib/video.ts` de la app** — se copia en vez de importarse
 * porque este paquete se publica a npm y no puede depender del árbol de Next.
 * Mismo criterio que `rest.ts` (portado de `supabase/tests/concurrencia.mjs`).
 * La app es la autoridad: si allá cambian las reglas, este archivo las sigue.
 *
 * Se valida aquí en vez de dejar pasar cualquier cadena porque un link que la
 * app no reconoce se guarda sin error y la ficha simplemente no pinta el video
 * — un fallo silencioso que el agente no puede detectar.
 */
export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return `https://www.youtube-nocookie.com/embed/${v}`
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  if (host === 'youtu.be') {
    const m = u.pathname.match(/^\/([\w-]{11})$/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)$/)
    return m ? `https://player.vimeo.com/video/${m[1]}` : null
  }
  return null
}
