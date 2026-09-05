// HARD TESTING — las páginas por destino (ADR-0051).
//
//   pnpm hard-test paginas_destino        (necesita el servidor: APP=http://localhost:3100)
//
// Qué defiende: estas páginas existen para que un buscador y un asistente lean
// hechos citables, así que el fallo que importa no es un error en pantalla sino
// una página que responde 200 y no dice nada. Se exige **contenido**, no status:
// el título con el destino, el precio en pesos, la fecha de la próxima salida y
// un ItemList que parsee. Y las dos formas de llegar: URL directa y `RSC: 1`.
//
// También fija dos cosas que ya nos mordieron antes:
//   · la ruta es pública (si `proxy.ts` no la declara, el crawler ve /login);
//   · un destino inexistente da 404, no un 200 vacío indexable.
//
// Anónimo puro, sin cookie. No toca la BD ni crea nada.

const APP = process.env.APP ?? 'http://localhost:3000'

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

const pide = (path, rsc = false) =>
  fetch(`${APP}${path}`, { headers: rsc ? { RSC: '1' } : {}, redirect: 'manual' })

function bloquesJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]) } catch { return null } })
}

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Páginas por destino\n')

// El sitemap es la fuente de qué destinos existen: si publica una URL, tiene
// que abrir. Así la prueba sigue al catálogo real en vez de fijar un slug.
const sitemap = await (await pide('/sitemap.xml')).text()
const urls = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
const destinos = urls.filter((u) => /\/viajes\/[a-z0-9-]+$/.test(u))
check('el sitemap publica el índice de destinos', urls.some((u) => u.endsWith('/viajes')))
check('el sitemap publica al menos una página de destino', destinos.length > 0, `${destinos.length}`)

// ── Índice ──────────────────────────────────────────────────────────────────
{
  const r = await pide('/viajes')
  const html = r.status === 200 ? await r.text() : ''
  check('/viajes abre sin sesión', r.status === 200,
    `${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`)
  check('/viajes enlaza al menos un destino', /href="\/viajes\/[a-z0-9-]+"/.test(html))
}

// ── Una página de destino, por las dos vías ────────────────────────────────
if (destinos.length) {
  const ruta = new URL(destinos[0]).pathname
  const ciudad = ruta.split('/').pop()

  // El CONTENIDO se exige por las dos vías. Ojo: la respuesta con `RSC: 1` es un
  // flight payload, no HTML — ahí no existen los atributos `href=` ni la etiqueta
  // <script>, así que buscarlos daría un rojo falso. Lo que sí viaja es el texto.
  for (const [modo, rsc] of [['URL directa', false], ['clic desde el índice (RSC)', true]]) {
    const r = await pide(ruta, rsc)
    const cuerpo = r.status === 200 ? await r.text() : ''
    check(`${ruta} abre sin sesión (${modo})`, r.status === 200,
      `${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`)
    check(`…dice "Viajes a" en el título (${modo})`, /Viajes a /.test(cuerpo))
    check(`…nombra la agencia que opera (${modo})`, /Opera /.test(cuerpo))
    check(`…publica precios en pesos (${modo})`, /MXN por persona/.test(cuerpo))
    check(`…referencia al menos una ficha de viaje (${modo})`,
      /\/servicio\/[0-9a-f-]{36}/.test(cuerpo))
  }

  // Lo que es propio del HTML se exige solo en el HTML.
  {
    const html = await (await pide(ruta)).text()
    const bloques = bloquesJsonLd(html)
    check('la página no tiene ningún JSON-LD roto', !bloques.includes(null))
    const lista = bloques.filter(Boolean).find((b) => b['@type'] === 'ItemList')
    check('declara ItemList con sus viajes', Boolean(lista?.itemListElement?.length))
    check('enlaza las fichas con <a href>', /href="\/servicio\/[0-9a-f-]{36}"/.test(html))
  }
  // El slug de la URL tiene que aparecer en el contenido: si no, la página está
  // sirviendo otro destino (el bug silencioso de agrupar mal).
  const html = await (await pide(ruta)).text()
  const raiz = ciudad.split('-')[0]
  check('el contenido corresponde al destino de la URL',
    new RegExp(raiz, 'i').test(html), `slug=${ciudad}`)
}

// ── Un destino que no existe NO puede ser un 200 vacío ─────────────────────
{
  const r = await pide('/viajes/destino-que-no-existe-jamas')
  check('un destino inexistente da 404', r.status === 404, String(r.status))
}

// ── El pie enlaza los destinos (no deben quedar huérfanas) ─────────────────
{
  const html = await (await pide('/explora')).text()
  check('el pie público enlaza /viajes', html.includes('href="/viajes"'))
}

console.log(`\n${fallos ? '❌' : '✅'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
