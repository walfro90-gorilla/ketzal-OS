// HARD TESTING — la superficie que leen los buscadores y los asistentes de IA.
//
//   pnpm hard-test aeo_superficie        (necesita el servidor: APP=http://localhost:3100)
//
// Qué defiende (ADR-0026): un JSON-LD que no parsea, o un `llms.txt` que
// describe un catálogo que ya no existe, no dan error en ninguna pantalla —
// simplemente no sirven, y nadie se entera. Aquí se exige que:
//   · la portada declare la marca (Organization + WebSite atados por @id);
//   · la ficha de un tour publique agencia, precio y la próxima salida;
//   · `llms.txt` liste tours REALES del catálogo vivo, con su URL de ficha;
//   · `robots.txt` siga permitiendo a los crawlers de IA;
//   · todo bloque JSON-LD del sitio sea JSON válido.
//
// Anónimo puro, sin cookie. No toca la BD ni crea nada.

const APP = process.env.APP ?? 'http://localhost:3000'

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

/** Todos los bloques JSON-LD de una página, ya parseados. Un bloque que no
 *  parsea se devuelve como null para poder reportarlo (no se traga el error). */
function bloquesJsonLd(html) {
  const crudos = [...html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  )].map((m) => m[1])
  return crudos.map((c) => {
    try { return JSON.parse(c) } catch { return null }
  })
}

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Superficie SEO/AEO\n')

// ── Portada: identidad de marca ─────────────────────────────────────────────
{
  const r = await fetch(`${APP}/`, { redirect: 'manual' })
  const html = r.status === 200 ? await r.text() : ''
  const bloques = bloquesJsonLd(html)
  check('/ responde 200 sin sesión', r.status === 200, String(r.status))
  check('/ no tiene ningún JSON-LD roto', !bloques.includes(null))
  const grafo = bloques.filter(Boolean).flatMap((b) => b['@graph'] ?? [b])
  const org = grafo.find((n) => n['@type'] === 'Organization')
  const sitio = grafo.find((n) => n['@type'] === 'WebSite')
  check('/ declara Organization con nombre y url', Boolean(org?.name && org?.url))
  check('/ declara WebSite', Boolean(sitio))
  check('el WebSite apunta a la Organization por @id',
    Boolean(org?.['@id']) && sitio?.publisher?.['@id'] === org['@id'])
}

// ── Ficha de un tour: los hechos citables ───────────────────────────────────
const sitemap = await (await fetch(`${APP}/sitemap.xml`, { redirect: 'manual' })).text()
const fichas = [...sitemap.matchAll(/<loc>([^<]*\/servicio\/[^<]*)<\/loc>/g)].map((m) => m[1])
check('el sitemap publica al menos una ficha de tour', fichas.length > 0, `${fichas.length}`)

if (fichas.length) {
  // El sitemap trae URLs absolutas del dominio público; para pegarle al
  // servidor local se conserva sólo la ruta.
  const ruta = new URL(fichas[0]).pathname
  const r = await fetch(`${APP}${ruta}`, { redirect: 'manual' })
  const html = r.status === 200 ? await r.text() : ''
  const bloques = bloquesJsonLd(html)
  check(`${ruta} responde 200 sin sesión`, r.status === 200, String(r.status))
  check('la ficha no tiene ningún JSON-LD roto', !bloques.includes(null))
  const viaje = bloques.filter(Boolean).find((b) => b['@type'] === 'TouristTrip')
  check('la ficha declara TouristTrip', Boolean(viaje))
  check('…con la agencia que lo opera', viaje?.provider?.name?.length > 0)
  check('…con precio en MXN', viaje?.offers?.priceCurrency === 'MXN' && viaje?.offers?.price > 0)
  // `departureTime` sólo existe si el tour tiene salidas cargadas: se exige
  // coherencia, no presencia — si dice InStock, tiene que haber fecha.
  const enStock = viaje?.offers?.availability === 'https://schema.org/InStock'
  check('si dice InStock, publica la fecha de la próxima salida',
    !enStock || Boolean(viaje?.departureTime), JSON.stringify(viaje?.offers ?? {}))
}

// ── llms.txt: el catálogo vivo ──────────────────────────────────────────────
{
  const r = await fetch(`${APP}/llms.txt`, { redirect: 'manual' })
  const txt = await r.text()
  check('/llms.txt responde 200', r.status === 200, String(r.status))
  check('/llms.txt se sirve como texto plano',
    (r.headers.get('content-type') ?? '').includes('text/plain'))
  check('/llms.txt enlaza la ficha de un tour real', /\/servicio\/[0-9a-f-]{36}/.test(txt))
  check('/llms.txt dice los precios en MXN', /MXN/.test(txt))
  check('/llms.txt nombra la agencia que opera', /operado por /.test(txt))
}

// ── robots.txt: los crawlers de IA siguen invitados ─────────────────────────
{
  const txt = await (await fetch(`${APP}/robots.txt`, { redirect: 'manual' })).text()
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
    check(`robots.txt nombra a ${bot}`, txt.includes(bot))
  }
  check('robots.txt anuncia el sitemap', /Sitemap:\s*https?:\/\//i.test(txt))
}

// ── IndexNow: env-gated de verdad ───────────────────────────────────────────
{
  // `redirect: 'manual'` NO es cosmético: sin él, el 307 a /login que daba el
  // proxy antes de declararla pública se seguía hasta un 200 y la prueba pasaba
  // en verde con IndexNow roto. Fue exactamente lo que ocurrió (2026-09-04).
  const r = await fetch(`${APP}/indexnow-key.txt`, { redirect: 'manual' })
  const txt = r.status === 200 ? (await r.text()).trim() : ''
  // La env vive en el SERVIDOR, no en este proceso: preguntarle a
  // `process.env` de aquí compara dos entornos distintos y da rojos falsos.
  // El invariante real es que sólo hay dos desenlaces legítimos, y que
  // ninguno de los dos es un redirect a /login.
  check('/indexnow-key.txt: 404 sin clave, o la clave en texto plano — nunca /login',
    r.status === 404 || (r.status === 200 && txt.length > 0),
    `${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`)
  console.log(`     (clave ${r.status === 200 ? 'configurada' : 'no configurada'} en este entorno)`)
}

console.log(`\n${fallos ? '❌' : '✅'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
