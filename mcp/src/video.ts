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

/** Lo que el oembed del proveedor dice de un video que sí existe. */
export type VideoInfo = { titulo: string; canal: string }

/** La liga canónica que entiende el oembed, a partir de la que ya validó `videoEmbedUrl`. */
function ligaCanonica(embed: string): { proveedor: 'youtube' | 'vimeo'; url: string } | null {
  const yt = embed.match(/^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{11})$/)
  if (yt) return { proveedor: 'youtube', url: `https://www.youtube.com/watch?v=${yt[1]}` }
  const vm = embed.match(/^https:\/\/player\.vimeo\.com\/video\/(\d+)$/)
  if (vm) return { proveedor: 'vimeo', url: `https://vimeo.com/${vm[1]}` }
  return null
}

/**
 * ¿Ese video EXISTE, y de quién es?
 *
 * `videoEmbedUrl` sólo valida la FORMA de la liga: once caracteres que casen con
 * `[\w-]{11}` pasan aunque nadie haya subido ese video nunca. Un LLM que inventa
 * un id pasa ese filtro y deja un reproductor muerto en una ficha pública — y el
 * schema de `ketzal_editar_servicio` le pide al agente "verifica que el video
 * exista y no sea de una agencia competidora" sin darle con qué.
 *
 * El oembed de YouTube y el de Vimeo contestan sin API key y traen el título y el
 * canal dueño, que es justo lo que hace falta para decidir lo segundo.
 *
 * **Falla-abierto ante fallo de red, falla-cerrado ante 404.** Un 404 es una
 * respuesta del proveedor: ese video no existe y no debe guardarse. Un timeout o
 * un 429 no dicen nada del video, y bloquear una edición legítima porque YouTube
 * va lento sería peor que el problema que esto resuelve.
 *
 * @returns los datos si existe; `null` si no se pudo verificar.
 * @throws si el proveedor contesta que el video no existe.
 */
export async function verificarVideo(embed: string): Promise<VideoInfo | null> {
  const canon = ligaCanonica(embed)
  if (!canon) return null

  const api =
    canon.proveedor === 'youtube'
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(canon.url)}&format=json`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canon.url)}`

  let r: Response
  try {
    r = await fetch(api, { signal: AbortSignal.timeout(6000) })
  } catch {
    return null // ponytail: sin red no opinamos; el formato ya quedó validado.
  }

  // YouTube contesta **400 Bad Request** —no 404— cuando el id no corresponde a
  // ningún video; Vimeo sí usa 404. Los dos significan lo mismo y salieron de
  // probar contra los endpoints reales: con sólo 404 el id inventado pasaba
  // derecho, que es justo el caso que esto viene a atajar.
  if (r.status === 400 || r.status === 404) {
    throw new Error(`ese video no existe (${canon.url})`)
  }
  // ponytail: 401/403 se dejan pasar. Vimeo los usa para "existe pero su dueño
  // restringe dónde se puede incrustar", y esa restricción depende del dominio que
  // pregunta — bloquear aquí rechazaría videos que en la ficha pública sí cargan.
  if (!r.ok) return null

  const j = (await r.json().catch(() => null)) as { title?: string; author_name?: string } | null
  if (!j) return null
  return { titulo: j.title ?? '(sin título)', canal: j.author_name ?? '(canal desconocido)' }
}
