/**
 * Normalización de lo que devuelve el modelo al leer un PDF/imagen de un tour.
 *
 * La salida de un LLM es entrada NO confiable: puede traer tipos equivocados,
 * precios con "$1,500 MXN", fechas inventadas, arreglos gigantes o claves de
 * más. Este módulo la acota a algo que el formulario pueda pintar sin romperse.
 * NO valida dominio (tipo de servicio, precios contra reglas de negocio): eso
 * ya lo hace el form al capturar y `normalizarCampos` al guardar. Aquí solo se
 * acota forma, tipo y tamaño.
 *
 * Módulo puro y SIN imports a propósito: así el self-check (`servicio-leido.test.mjs`)
 * corre con `node --test` sin tocar el bundler ni el alias `@/`.
 */

export type ServicioLeido = {
  name?: string
  description?: string
  /** Sin normalizar contra el catálogo: el form lo pasa por `normalizarTipo`. */
  service_type?: string
  price?: number
  max_capacity?: number
  state_from?: string
  city_from?: string
  state_to?: string
  city_to?: string
  /** YYYY-MM-DD o ausente. */
  available_from?: string
  available_to?: string
  includes?: string[]
  excludes?: string[]
  itinerary?: { title: string; description: string }[]
  /** Precio por persona según ocupación, indexado por key de PACK_TYPES. */
  packs?: Record<string, number>
}

/**
 * Tope de subida del lector, compartido por el cliente y el server action.
 *
 * El techo real NO lo pone la app: Vercel corta el body de una función en
 * **4.5 MB** y devuelve 413 antes de que el action corra (límite de plataforma,
 * no se sube por config). Por eso 4 MB, que deja aire para el multipart.
 * El cliente DEBE checar esto antes de subir: si el 413 ocurre, la respuesta no
 * es de server action y el cliente truena con un error sin manejar.
 *
 * ponytail: el path de imagen manda el archivo en base64 a Groq (+33%). Si un
 * volante fotografiado empieza a fallar del lado de Groq por tamaño, la salida
 * es redimensionar en el cliente con canvas, no bajar más este número.
 */
export const MAX_BYTES = 4 * 1024 * 1024

/** Mismo texto en el guard del cliente y en el del servidor. */
export const MENSAJE_PESO =
  'El archivo pesa más de 4 MB. Comprímelo o toma una captura de pantalla.'

const MAX_LISTA = 40
const MAX_DIAS = 30

function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().slice(0, max)
  return t || undefined
}

/**
 * Acepta 1500, "1500", "$1,500.00 MXN". Rechaza negativos y no-números.
 * Ojo: hay que cortar el string SIN dígitos antes de `Number`, porque
 * `Number('')` es 0 y "n/a" o "gratis" se colarían como precio cero.
 */
function numero(v: unknown): number | undefined {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const limpio = v.replace(/[^\d.]/g, '')
    if (!/\d/.test(limpio)) return undefined
    n = Number(limpio)
  } else return undefined
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n * 100) / 100
}

function entero(v: unknown): number | undefined {
  const n = numero(v)
  if (n == null || n < 1) return undefined
  return Math.trunc(n)
}

/**
 * Solo YYYY-MM-DD con mes/día reales. El modelo tiende a alucinar el año
 * cuando el volante trae "15 de marzo" sin año; eso llega como otro formato
 * y se descarta. ponytail: sin años bisiestos, `new Date` ya reacomoda.
 */
function fecha(v: unknown): string | undefined {
  const t = texto(v, 10)
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined
  const d = new Date(`${t}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10) === t ? t : undefined
}

function lista(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const items: string[] = []
  for (const x of v.slice(0, MAX_LISTA)) {
    const t = texto(x, 300)
    if (t) items.push(t)
  }
  return items.length ? items : undefined
}

function itinerario(v: unknown): { title: string; description: string }[] | undefined {
  if (!Array.isArray(v)) return undefined
  const dias: { title: string; description: string }[] = []
  for (const d of v.slice(0, MAX_DIAS)) {
    if (!d || typeof d !== 'object') continue
    const fila = d as Record<string, unknown>
    const title = texto(fila.title, 200)
    if (!title) continue // sin título el form lo descartaría al guardar
    dias.push({ title, description: texto(fila.description, 2000) ?? '' })
  }
  return dias.length ? dias : undefined
}

/**
 * Precios por ocupación. No filtra contra PACK_TYPES: el form solo pinta y
 * envía las keys que conoce, así que una clave inventada muere ahí sola.
 */
function paquetes(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, number> = {}
  for (const [key, valor] of Object.entries(v as Record<string, unknown>).slice(0, 10)) {
    const p = numero(valor)
    if (p != null) out[key] = p
  }
  return Object.keys(out).length ? out : undefined
}

/** Deja fuera toda clave ausente, para que el form no pise campos con vacíos. */
function compactar(obj: ServicioLeido): ServicioLeido {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as ServicioLeido
}

export function normalizarLeido(raw: unknown): ServicioLeido {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  return compactar({
    name: texto(r.name, 200),
    description: texto(r.description, 2000),
    service_type: texto(r.service_type, 40)?.toLowerCase(),
    price: numero(r.price),
    max_capacity: entero(r.max_capacity),
    state_from: texto(r.state_from, 100),
    city_from: texto(r.city_from, 100),
    state_to: texto(r.state_to, 100),
    city_to: texto(r.city_to, 100),
    available_from: fecha(r.available_from),
    available_to: fecha(r.available_to),
    includes: lista(r.includes),
    excludes: lista(r.excludes),
    itinerary: itinerario(r.itinerary),
    packs: paquetes(r.packs),
  })
}

/** ¿El modelo devolvió algo aprovechable? Si no, no vale ensuciar el form. */
export function tieneDatos(d: ServicioLeido): boolean {
  return Object.keys(d).length > 0
}
