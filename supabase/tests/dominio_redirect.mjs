// HARD TESTING — el host viejo redirige al dominio público (ADR-0040).
//
//   pnpm hard-test dominio_redirect        (necesita el servidor local: APP=http://localhost:3000)
//
// Qué defiende: `ketzal-os.vercel.app` → `https://ketzal.tours` con 308 y la
// query intacta (los `?ref=` de embajadores y las cotizaciones ya repartidas
// siguen abriendo), `/api` NO redirige (el webhook y el OAuth de Mercado Pago
// se registraron con el host viejo), y otros hosts no se tocan.
//
// No toca la BD. Sin `commit`.

const BASE = process.env.APP ?? 'http://localhost:3000'
const VIEJO = 'ketzal-os.vercel.app'
const APEX = 'https://ketzal.tours'

import http from 'node:http'

const casos = []
// `fetch` (undici) descarta el header `Host` — es "forbidden" por la spec —
// así que la petición va por node:http, que sí lo manda tal cual.
function pide(path, host) {
  const u = new URL(path, BASE)
  return new Promise((res, rej) => {
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers: { Host: host } },
      (resp) => {
        resp.resume()
        res({ status: resp.statusCode, location: resp.headers.location ?? '' })
      }
    )
    r.on('error', rej)
    r.end()
  })
}
function caso(nombre, ok, detalle) {
  casos.push({ nombre, ok, detalle })
}

const a = await pide('/explora?ref=QA', VIEJO)
caso('host viejo /explora?ref=QA → 308 al apex con el ref',
  a.status === 308 && a.location === `${APEX}/explora?ref=QA`, JSON.stringify(a))

const b = await pide('/', VIEJO)
caso('host viejo / → 308 al apex', b.status === 308 && b.location === `${APEX}/`, JSON.stringify(b))

const c = await pide('/cotizacion/00000000-0000-4000-8000-000000000000', VIEJO)
caso('host viejo /cotizacion/<token> → 308 conservando la ruta',
  c.status === 308 && c.location === `${APEX}/cotizacion/00000000-0000-4000-8000-000000000000`, JSON.stringify(c))

const d = await pide('/api/track', VIEJO)
caso('host viejo /api/track NO redirige', d.status < 300 || d.status >= 400, JSON.stringify(d))

const e = await pide('/explora?ref=QA', 'localhost:3000')
caso('otro host /explora no redirige', e.status !== 308 && e.status !== 301, JSON.stringify(e))

const ok = casos.filter((x) => x.ok).length
const fail = casos.length - ok
for (const x of casos) console.log(`${x.ok ? '✔' : '✘'} ${x.nombre}${x.ok ? '' : ` — ${x.detalle}`}`)
console.log(`HARD-TEST dominio_redirect: ${ok} pasaron, ${fail} fallaron.`)
process.exit(fail ? 1 : 0)
