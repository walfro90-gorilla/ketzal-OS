// Convierte un link de YouTube o Vimeo en su URL de *embed*. Devuelve null si
// no es un video soportado. Fuente única: se usa para validar al guardar
// (setServicioVideo) y para el embed en la ficha pública, sin divergir. Se
// prefiere youtube-nocookie para no plantar cookies de tracking en la vitrina.

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

  // YouTube: watch?v=ID · youtu.be/ID · /embed/ID · /shorts/ID
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const v = u.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) {
      return `https://www.youtube-nocookie.com/embed/${v}`
    }
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  if (host === 'youtu.be') {
    const m = u.pathname.match(/^\/([\w-]{11})$/)
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null
  }
  // Vimeo: vimeo.com/ID
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)$/)
    return m ? `https://player.vimeo.com/video/${m[1]}` : null
  }
  return null
}
