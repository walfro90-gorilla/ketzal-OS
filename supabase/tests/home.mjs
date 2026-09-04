// Harness de la home pública (KETZAL_HOME_REDESIGN.md §8, ADR-0046/0047).
//
// Afirma sobre CONTENIDO, no sobre status (ADR-0043): Next sirve su página de
// error con 200 en la ruta RSC. Casos:
//   · `/` responde 200 con el H1 de la spec, también con cabecera `RSC: 1`.
//   · Hay UNA sola imagen prioritaria (fetchpriority="high") y es la captura
//     del producto (alt descriptivo), servida por el optimizador.
//   · La nav no enlaza al marketplace (/explora); el footer sí puede.
//   · `/styleguide` sin sesión → 307 a /login (referencia interna).
//
// Cómo:  APP=http://localhost:3300 node supabase/tests/home.mjs
// No toca la BD ni crea cuentas: solo HTTP anónimo.

const APP = process.env.APP ?? 'http://localhost:3000'

let ok = 0, fallos = 0
const check = (n, c, d = '') => { if (c) { ok++; console.log(`   ✔ ${n}`) } else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) } }

try {
  await fetch(`${APP}/login`)
} catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app o pasa APP=<url>.\n`)
  process.exit(1)
}

const H1 = 'Vende más viajes. Cobra a tiempo. Sin hojas de cálculo.'

const r = await fetch(`${APP}/`, { redirect: 'manual' })
const html = await r.text()
check('/ responde 200', r.status === 200, `status ${r.status}`)
check('/ trae el H1 de la spec', html.includes(H1))
check('un solo <h1>', (html.match(/<h1[\s>]/g) ?? []).length === 1, `${(html.match(/<h1[\s>]/g) ?? []).length} h1`)

// La imagen LCP: una y solo una con prioridad, y es la captura real.
const prioritarias = html.match(/<img[^>]*fetchpriority="high"[^>]*>/gi) ?? []
check('exactamente UNA imagen con fetchpriority="high"', prioritarias.length === 1, `${prioritarias.length}`)
check('la prioritaria es la captura del producto (alt descriptivo, no "imagen de dashboard")',
  /alt="Pantalla de una venta en Ketzal OS/.test(prioritarias[0] ?? '') && !/alt="imagen/i.test(prioritarias[0] ?? ''))
check('la prioritaria sale por el optimizador (/_next/image) con srcset',
  /src="\/_next\/image\?url=/.test(prioritarias[0] ?? '') && /srcset=/i.test(prioritarias[0] ?? ''))
// Con `?? ''` pasaría en vacío: exigir que exista antes de mirar su loading.
check('la prioritaria existe y NO es lazy', prioritarias.length === 1 && !/loading="lazy"/.test(prioritarias[0]))
check('la prioritaria pide quality 85 (Next 16 exige images.qualities)', /q=85/.test(prioritarias[0] ?? ''))
check('hay <link rel="preload" as="image"> para la LCP', /<link[^>]*rel="preload"[^>]*as="image"/.test(html))

// Etapa 3: capturas reales (≥ 3 además del hero), todas con alt propio y por
// el optimizador; solo la del hero es prioritaria, las demás lazy.
const imgs = html.match(/<img[^>]*>/gi) ?? []
check('hay al menos 4 imágenes (hero + 3 capturas del producto)', imgs.length >= 4, `${imgs.length}`)
check('ninguna imagen sale como PNG crudo: todas por /_next/image',
  imgs.every((i) => /src="\/_next\/image\?/.test(i)))
check('todas tienen alt descriptivo (≥ 40 caracteres, sin "imagen de")',
  imgs.every((i) => { const a = /alt="([^"]*)"/.exec(i)?.[1] ?? ''; return a.length >= 40 && !/^imagen/i.test(a) }))
check('las no prioritarias son lazy', imgs.filter((i) => !/fetchpriority="high"/i.test(i)).every((i) => /loading="lazy"/.test(i)))
check('las dos agencias reales aparecen con nombre', html.includes('Wanderlust Travels') && html.includes('Border Travels'))
check('sin métricas inventadas ni logo wall: no hay "+", "%" ni "clientes" en la franja de credibilidad',
  !/Agencias que ya[^<]*<\/h2>[\s\S]{0,600}(\d+\+|\d+ ?%|clientes)/.test(html))

// Etapa 4: pasos numerados con captura, inventario REAL de la vitrina y la
// capa de IA con enlace verificable.
const pasos = /<ol[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? ''
check('"Cómo funciona" es un <ol> con exactamente 3 pasos', (pasos.match(/<li[\s>]/g) ?? []).length === 3)
check('cada paso lleva su captura (3 <img> dentro del <ol>)', (pasos.match(/<img[\s>]/g) ?? []).length === 3)
check('el inventario muestra la Huasteca de Border Travels con su precio real',
  html.includes('Huasteca Potosina en Avión') && html.includes('Border Travels') && html.includes('$7,999'))
check('las fotos del inventario salen del Storage por el optimizador',
  /\/_next\/image\?url=https%3A%2F%2F[^"]*ketzal-assets/.test(html))
check('la capa de IA enlaza al paquete real en npm', html.includes('href="https://www.npmjs.com/package/ketzal-mcp"') && html.includes('npm i ketzal-mcp'))
check('la home no promete herramientas que el MCP no tiene',
  ['ketzal_cobranza', 'ketzal_registrar_abono', 'ketzal_ventas'].every((h) => html.includes(h)) && !/ketzal_(whatsapp|enviar_mensaje|cfdi)/.test(html))
check('sin copy vacío (§7)', !/potencia|transforma|revoluciona|sin fricci|soluci[oó]n integral/i.test(html))

// Nav sin marketplace (ADR-0047). El footer puede tener la puerta discreta.
const header = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? ''
check('hay <header> con nav', header.includes('<nav'))
check('la nav no enlaza a /explora ni /agencias', !/href="\/(explora|agencias)/.test(header))
check('la nav enlaza a /login', /href="\/login"/.test(header))

// Por clic (RSC) también hay contenido, no una página de error con 200.
const rsc = await fetch(`${APP}/`, { headers: { RSC: '1' }, redirect: 'manual' })
const flight = await rsc.text()
check('/ por RSC responde 200 con el H1 dentro del flight', rsc.status === 200 && flight.includes(H1), `status ${rsc.status}`)

// La referencia interna exige sesión.
const sg = await fetch(`${APP}/styleguide`, { redirect: 'manual' })
check('/styleguide anónimo → 307 a /login', sg.status === 307 && (sg.headers.get('location') ?? '').includes('/login'), `status ${sg.status}`)

console.log(`\n${ok} pasaron, ${fallos} fallaron`)
process.exit(fallos ? 1 : 0)
