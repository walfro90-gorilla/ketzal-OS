/**
 * Cliente de PostgREST con el JWT del usuario.
 *
 * Portado de `supabase/tests/concurrencia.mjs:26-56` del repo, que ya golpea el
 * mismo camino que la app en producción, RLS incluida. Por eso el paquete NO
 * depende de `@supabase/supabase-js`: son tres llamadas HTTP y así el arranque de
 * `npx` es inmediato.
 *
 * `Content-Profile: ketzal` (escrituras/RPC) y `Accept-Profile: ketzal` (lecturas)
 * son load-bearing: sin ellos PostgREST busca en `public` y todo devuelve 404.
 */
import { SCHEMA, SUPABASE_KEY, SUPABASE_URL } from './config.js'
import { KetzalError, safeError, type PgError } from './errors.js'
import { getAccessToken } from './session.js'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function call(method: Method, path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const send = async (token: string) => {
    const headers: Record<string, string> = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      ...(method === 'GET' ? { 'Accept-Profile': SCHEMA } : { 'Content-Profile': SCHEMA }),
      ...extraHeaders,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  let r = await send(await getAccessToken())
  // Reintento único en 401: un 401 significa que la petición fue rechazada ANTES
  // de ejecutarse, así que no hay efecto que duplicar — seguro incluso en escrituras.
  if (r.status === 401) r = await send(await getAccessToken(true))

  const text = await r.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!r.ok) throw new KetzalError(safeError(parsed as PgError))
  return parsed
}

/** Llama un RPC del schema `ketzal` con el JWT del usuario. */
export function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const limpio = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))
  return call('POST', `rpc/${fn}`, limpio) as Promise<T>
}

/** Lectura directa de tabla/vista (RLS aplica). `query` es la query-string de PostgREST. */
export function select<T = unknown>(table: string, query = ''): Promise<T> {
  return call('GET', query ? `${table}?${query}` : table, undefined) as Promise<T>
}

/** Inserta y devuelve la fila creada. */
export async function insert<T = unknown>(table: string, row: Record<string, unknown>): Promise<T> {
  const rows = (await call('POST', table, row, { Prefer: 'return=representation' })) as T[]
  return rows[0] as T
}

/** Actualiza las filas que casen con `query` y devuelve las resultantes. */
export function update<T = unknown>(
  table: string,
  query: string,
  patch: Record<string, unknown>,
): Promise<T[]> {
  return call('PATCH', `${table}?${query}`, patch, { Prefer: 'return=representation' }) as Promise<T[]>
}

/** Escapa un valor para un filtro de PostgREST (`eq.`, `in.`…). */
export function q(value: string | number | boolean): string {
  return encodeURIComponent(String(value))
}
