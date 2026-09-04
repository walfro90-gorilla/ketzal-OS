// HARD TESTING — las páginas legales las ve QUIEN NO tiene sesión.
//
//   pnpm hard-test paginas_legales        (necesita el servidor: APP=http://localhost:3100)
//
// Qué defiende: el aviso de privacidad y la política de cancelación son texto
// legal público. Si `proxy.ts` no las declara públicas, un visitante sin sesión
// —y el crawler de Google o de Meta— reciben un 307 a `/login`: la ley pide que
// el aviso esté donde se recaban los datos, y nadie con sesión iniciada lo nota
// nunca. Pasó exactamente eso al estrenar `/privacidad` (2026-09-03), y lo cazó
// esta prueba antes de mergear.
//
// Se exige **contenido, no status**, y las dos formas de llegar: URL directa y
// con cabecera `RSC: 1` (el clic desde el pie del sitio). Un 200 no basta: la
// pantalla de error de Next también responde 200 por el camino RSC.
//
// Anónimo puro: no manda cookie. No toca la BD, no crea nada.

const APP = process.env.APP ?? 'http://localhost:3000'

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

// Marcas de que la página se renderizó DE VERDAD (no un error ni un redirect).
const PAGINAS = [
  { ruta: '/privacidad', marcas: ['Aviso de privacidad', 'ARCO', 'píxel de Meta'] },
  { ruta: '/politica-cancelacion', marcas: ['Política de cancelación', 'crédito'] },
]

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Páginas legales sin sesión\n')

for (const { ruta, marcas } of PAGINAS) {
  for (const [modo, extra] of [['URL directa', {}], ['clic desde el pie (RSC)', { RSC: '1' }]]) {
    const r = await fetch(`${APP}${ruta}`, { headers: extra, redirect: 'manual' })
    const html = r.status === 200 ? await r.text() : ''
    check(`${ruta} responde 200 sin sesión (${modo})`, r.status === 200,
      `${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`)
    for (const m of marcas) {
      check(`${ruta} trae "${m}" (${modo})`, html.includes(m))
    }
  }
}

// El pie de las páginas públicas tiene que llevar al aviso: es el único camino
// para quien nunca llega al checkout.
const explora = await fetch(`${APP}/explora`, { redirect: 'manual' })
const htmlExplora = explora.status === 200 ? await explora.text() : ''
check('el pie público enlaza /privacidad', htmlExplora.includes('href="/privacidad"'))

// El sitemap las anuncia; si la ruta muriera, el sitemap mentiría.
const sm = await fetch(`${APP}/sitemap.xml`)
const xml = await sm.text()
check('el sitemap incluye /privacidad', xml.includes('/privacidad'))
check('el sitemap incluye /politica-cancelacion', xml.includes('/politica-cancelacion'))

console.log(`\n${fallos ? '❌' : '✅'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
