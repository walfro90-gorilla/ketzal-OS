/** Atribución first-touch y eventos de funnel, lado cliente (ADR-0025).
 *  Todo es best-effort: storage puede lanzar (Safari privado, webviews) y la
 *  red puede fallar — nada de aquí puede romper el checkout. Las funciones
 *  puras (parseo y TTL) están separadas del storage para testearse en node. */

export interface Attribution {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  fbclid?: string
  gclid?: string
  landing: string
  first_touch_at: string
}

export type FunnelEventName = 'checkout_open' | 'order_created' | 'pago_metodo'

const STORAGE_KEY = 'ktz_attribution'
const SESSION_KEY = 'ktz_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

const PARAM_MAP = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_content', 'content'],
  ['utm_term', 'term'],
  ['fbclid', 'fbclid'],
  ['gclid', 'gclid'],
] as const

/** Query string + pathname → atribución, o null si no viene ningún parámetro
 *  de campaña. Pura: no toca storage ni location. */
export function parseAttribution(
  search: string,
  pathname: string,
  now: Date
): Attribution | null {
  const qs = new URLSearchParams(search)
  const attr: Partial<Attribution> = {}
  let found = false
  for (const [param, key] of PARAM_MAP) {
    const value = qs.get(param)
    if (value) {
      attr[key] = value
      found = true
    }
  }
  if (!found) return null
  return { ...attr, landing: pathname, first_touch_at: now.toISOString() }
}

/** JSON crudo persistido → atribución vigente, o null si está malformada o su
 *  TTL de 30 días ya venció. Pura. */
export function readStoredAttribution(
  raw: string | null,
  now: Date
): Attribution | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as (Attribution & { expires_at?: string }) | null
    if (!parsed || typeof parsed !== 'object' || typeof parsed.landing !== 'string')
      return null
    if (!parsed.expires_at || new Date(parsed.expires_at).getTime() <= now.getTime())
      return null
    const attr = { ...parsed }
    delete attr.expires_at
    return attr
  } catch {
    return null
  }
}

/** Persiste el PRIMER touch de campaña si aún no hay uno vigente. */
export function captureFirstTouch(): void {
  try {
    const now = new Date()
    if (readStoredAttribution(localStorage.getItem(STORAGE_KEY), now)) return
    const attr = parseAttribution(location.search, location.pathname, now)
    if (!attr) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...attr,
        expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
      })
    )
  } catch {
    // storage bloqueado — la atribución simplemente no se guarda
  }
}

export function getAttribution(): Attribution | null {
  try {
    return readStoredAttribution(localStorage.getItem(STORAGE_KEY), new Date())
  } catch {
    return null
  }
}

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Webviews viejos sin randomUUID — alcanza para agrupar un funnel
    return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  }
}

let memorySessionId: string | null = null

/** Id de sesión de navegador (sessionStorage), con fallback en memoria. */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = uuid()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    memorySessionId ??= uuid()
    return memorySessionId
  }
}

/** Manda un evento de funnel a /api/track. Fire-and-forget con keepalive:
 *  jamás lanza ni bloquea la navegación que sigue. */
export function track(
  event: FunnelEventName,
  payload?: { service_id?: string; booking_id?: string; metodo?: 'mp' | 'spei' }
): void {
  try {
    void fetch('/api/track', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: getSessionId(), event, ...payload }),
    }).catch(() => {})
  } catch {
    // sin red ni fetch no hay métrica, y no pasa nada
  }
}
