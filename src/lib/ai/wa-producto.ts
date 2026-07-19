/**
 * Lectura de un link de producto de WhatsApp Business.
 *
 * Lo que se verificó antes de escribir esto (por si alguien quiere ampliarlo):
 * - `wa.me/p/{id}/{tel}` redirige a `whatsapp.com/product/{id}/{tel}` y el
 *   producto se resuelve en el servidor: sirve meta tags Open Graph al crawler.
 * - `wa.me/c/{tel}` (el CATÁLOGO) NO sirve para nada: la página pública es un
 *   interstitial de "abre la app". Cero productos en el HTML, cero XHR que los
 *   traiga, cero JSON embebido — comprobado con un navegador real sobre un
 *   negocio vivo. Un headless browser raspa la misma nada, así que no vale la
 *   pena intentarlo. El catálogo se importa producto por producto.
 * - Un producto inexistente NO da 404: devuelve 200 con `og:title` =
 *   "Page Not Found". Por eso se detecta por contenido, no por status.
 *
 * Módulo puro y SIN imports a propósito, igual que `servicio-leido`: así el
 * self-check corre con `node --test` sin tocar el bundler ni el alias `@/`.
 */

/**
 * Hosts permitidos. Esto es una frontera de confianza, no cosmética: el
 * servidor va a hacer `fetch` de una URL que teclea el usuario, así que sin
 * whitelist es un SSRF (pedirle al server que golpee la red interna o el
 * endpoint de metadatos del cloud). Se compara el hostname EXACTO — un
 * `includes('wa.me')` dejaría pasar `wa.me.atacante.com`.
 */
const HOSTS = new Set(['wa.me', 'www.whatsapp.com', 'whatsapp.com'])

/** `wa.me/p/…` es el link que copia la app; `/product/…` es a donde redirige. */
const RUTAS = [/^\/p\/\d+\/\d+\/?$/, /^\/product\/\d+\/\d+\/?$/]

/** WhatsApp responde 200 con este título cuando el producto ya no existe. */
export const TITULO_MUERTO = 'Page Not Found'

/**
 * Devuelve la URL normalizada si es un link de producto legítimo, o `null`.
 *
 * Normalizar a `https://{host}{path}` tira query, fragment y credenciales
 * embebidas (`https://user:pass@wa.me/...`), que no aportan nada y sí son
 * superficie de abuso.
 */
export function urlProductoValida(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null
  const limpia = entrada.trim()
  if (!limpia) return null

  let u: URL
  try {
    u = new URL(limpia)
  } catch {
    return null
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!HOSTS.has(u.hostname)) return null
  if (!RUTAS.some((r) => r.test(u.pathname))) return null

  return `https://${u.hostname}${u.pathname}`
}

/** Entidades HTML que sí aparecen en el OG de WhatsApp (`LIMIN&#039;s`). */
function desescapar(s: string): string {
  return (
    s
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      // &amp; al final SIEMPRE: si no, "&amp;lt;" se convertiría en "<".
      .replace(/&amp;/g, '&')
  )
}

export type OgProducto = {
  title?: string
  description?: string
  image?: string
}

/**
 * Saca los 3 meta tags que interesan. Regex y no un parser de HTML a propósito:
 * son tres tags en el `<head>` y el repo no tiene ninguna dependencia de parseo
 * (solo `unpdf`). Meter cheerio/jsdom por esto sería sobre-ingeniería.
 * No se asume orden de atributos: `content` puede ir antes que `property`.
 */
export function extraerOg(html: string): OgProducto {
  const og: OgProducto = {}
  // Los meta van en el <head>; recortar acota el trabajo en páginas de 200 KB.
  for (const m of html.slice(0, 300_000).matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const prop = /(?:property|name)\s*=\s*["']og:(title|description|image)["']/i.exec(tag)
    if (!prop) continue
    const cont = /content\s*=\s*["']([^"']*)["']/i.exec(tag)
    if (!cont) continue
    const valor = desescapar(cont[1]).trim()
    if (valor) og[prop[1] as keyof OgProducto] ??= valor
  }
  return og
}

/**
 * Arma el texto que se le manda al modelo, o `null` si la página no trae nada
 * aprovechable. Se etiqueta cada parte porque el prompt del lector espera
 * material de un tour, no un blob sin contexto.
 */
export function textoDeProducto(og: OgProducto): string | null {
  if (!og.title || og.title === TITULO_MUERTO) return null
  const partes = [`Producto: ${og.title}`]
  if (og.description) partes.push(`Descripción: ${og.description}`)
  return partes.join('\n')
}
