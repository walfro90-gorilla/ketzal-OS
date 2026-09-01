// Hard-test de la ATRIBUCIÓN del embajador (b082 / ADR-0031).
//
// Prueba lo que ninguna prueba de unidad ve: que el `?ref` SOBREVIVE el
// recorrido real de un comprador. Antes el código solo viajaba en la query
// string, hop a hop, y se respaldaba en localStorage recién al llegar a
// `/comprar` CON sesión. Bastaba tocar el logo, el footer, "← Todos los
// viajes", la ficha de una agencia o "Entrar" para perderlo — y con él, la
// comisión de quien trajo la venta.
//
// Se ejercita contra la app corriendo, siguiendo cookies como un navegador.
//   APP=http://localhost:3000 node --env-file=.env.local supabase/tests/atribucion_ref.mjs
//   (o APP=https://ketzal-os.vercel.app contra producción)

const APP = process.env.APP ?? 'http://localhost:3000'
const COOKIE = 'kz_ref'

let ok = 0
let fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

/** Navegador de mentiras: guarda las cookies que le van poniendo. */
function navegador() {
  const jar = new Map()
  return {
    jar,
    async ir(ruta) {
      const r = await fetch(`${APP}${ruta}`, {
        headers: jar.size
          ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }
          : {},
        redirect: 'manual',
      })
      for (const sc of r.headers.getSetCookie?.() ?? []) {
        const [par] = sc.split(';')
        const i = par.indexOf('=')
        const nombre = par.slice(0, i).trim()
        const valor = par.slice(i + 1).trim()
        if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc)) jar.delete(nombre)
        else jar.set(nombre, valor)
      }
      return r
    },
  }
}

console.log('\n== Atribución del embajador: ¿sobrevive el recorrido real? ==\n')
try {
  await fetch(`${APP}/explora`)
} catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app o pasa APP=<url>.\n`)
  process.exit(1)
}

// 1) Aterrizaje con ?ref en la vitrina ⇒ la cookie queda puesta.
{
  const nav = navegador()
  await nav.ir('/explora?ref=KETZALTEST')
  check('aterrizar en /explora?ref= planta la cookie', nav.jar.get(COOKIE) === 'KETZALTEST',
    `cookie: ${nav.jar.get(COOKIE)}`)
}

// 2) EL CASO QUE SE FUGABA: navegar por links que NO llevan el ref.
{
  const nav = navegador()
  await nav.ir('/explora?ref=KETZALTEST')
  await nav.ir('/agencias')          // link del header, sin ref
  await nav.ir('/explora')           // "← Todos los viajes", sin ref
  await nav.ir('/politica-cancelacion')
  check('sobrevive navegar por links que NO propagan el ref',
    nav.jar.get(COOKIE) === 'KETZALTEST', `cookie: ${nav.jar.get(COOKIE)}`)
}

// 3) Aterrizaje directo en la ficha de un tour compartido por el embajador.
{
  const nav = navegador()
  await nav.ir('/servicio/00000000-0000-0000-0000-000000000000?ref=KETZALTEST')
  check('la ficha de un tour también planta la cookie',
    nav.jar.get(COOKIE) === 'KETZALTEST', `cookie: ${nav.jar.get(COOKIE)}`)
}

// 4) Un código con basura no se guarda (mismo validador que la BD).
{
  const nav = navegador()
  await nav.ir('/explora?ref=' + encodeURIComponent('<script>x</script>'))
  check('un código inválido NO se guarda', !nav.jar.has(COOKIE),
    `cookie: ${nav.jar.get(COOKIE)}`)
}

// 5) LAST-touch: el último link gana (ADR-0031).
{
  const nav = navegador()
  await nav.ir('/explora?ref=KETZALTEST')
  await nav.ir('/explora?ref=KETZAL2026')
  check('last-touch: el último link gana', nav.jar.get(COOKIE) === 'KETZAL2026',
    `cookie: ${nav.jar.get(COOKIE)}`)
}

// 6) Sin ?ref no se planta nada (ninguna respuesta limpia lleva Set-Cookie).
{
  const nav = navegador()
  await nav.ir('/explora')
  check('sin ?ref no se pone cookie', !nav.jar.has(COOKIE))
}

// 7) El código se normaliza igual que en la BD (mayúsculas, sin espacios).
{
  const nav = navegador()
  await nav.ir('/explora?ref=' + encodeURIComponent(' ketzaltest '))
  check('el código se normaliza a mayúsculas', nav.jar.get(COOKIE) === 'KETZALTEST',
    `cookie: ${nav.jar.get(COOKIE)}`)
}

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exitCode = fallos === 0 ? 0 : 1
