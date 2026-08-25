// Cliente REST mínimo de Supabase, sobre `fetch`.
//
// Por qué NO `@supabase/supabase-js` aquí: arrastra `realtime-js`, que en Node
// < 22 exige el paquete `ws` y, sin él, **tira el proceso al construir el
// cliente**. La box corre Node 20, así que el bridge moría al arrancar en
// cuanto el `.env` tenía service key — un crash latente que sólo aparecía al
// activar la función. Nada de esto necesita realtime: son cuatro llamadas HTTP.
//
// Mismo patrón ya probado en el repo: `mcp/src/rest.ts` y
// `supabase/tests/concurrencia.mjs`.
//
// `Content-Profile` (escrituras/RPC) y `Accept-Profile` (lecturas) son
// load-bearing: sin ellos PostgREST busca en `public` y todo da 404.

export function crearSupa(url, key, schema = 'ketzal') {
  if (!url || !key) return null
  const base = `${url.replace(/\/$/, '')}/rest/v1/`

  async function call(method, path, { body, headers = {} } = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(method === 'GET' ? { 'Accept-Profile': schema } : { 'Content-Profile': schema }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const texto = await r.text()
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${texto.slice(0, 200)}`)
    let datos = null
    try {
      datos = texto ? JSON.parse(texto) : null
    } catch {
      datos = texto
    }
    return { datos, headers: r.headers }
  }

  return {
    async rpc(fn, args = {}) {
      const { datos } = await call('POST', `rpc/${fn}`, { body: args })
      return datos
    },

    /** `query` es la query-string de PostgREST: 'select=a,b&id=eq.1&order=created_at'. */
    async select(table, query = '') {
      const { datos } = await call('GET', query ? `${table}?${query}` : table)
      return datos ?? []
    },

    /** Cuenta sin traer las filas (Prefer: count=exact + Range de una). */
    async count(table, query = '') {
      const { headers } = await call('GET', `${table}?${query}`, {
        headers: { Prefer: 'count=exact', Range: '0-0' },
      })
      // content-range llega como "0-0/123" (o "*/0" cuando no hay filas).
      const total = (headers.get('content-range') || '').split('/')[1]
      return Number(total) || 0
    },

    /**
     * `ignorarDuplicados: true` = "insértalo si no está" (el opt-out entrante,
     * que no debe pisar el motivo original).
     */
    async upsert(table, fila, { onConflict, ignorarDuplicados = false } = {}) {
      const resolucion = ignorarDuplicados ? 'ignore-duplicates' : 'merge-duplicates'
      const q = onConflict ? `${table}?on_conflict=${encodeURIComponent(onConflict)}` : table
      await call('POST', q, {
        body: fila,
        headers: { Prefer: `resolution=${resolucion},return=minimal` },
      })
    },

    async update(table, query, patch) {
      await call('PATCH', `${table}?${query}`, {
        body: patch,
        headers: { Prefer: 'return=minimal' },
      })
    },
  }
}
