// Gate de CONTRASEÑA PROVISIONAL contra la app corriendo de verdad.
//
// `acceso_provisional.mjs` prueba el lado de Auth y la BD; esto prueba lo otro
// mitad: que los layouts de /embajador y /proveedor efectivamente NO dejan pasar
// a una cuenta que aún trae la contraseña que le dictaron, y que /nueva-password
// sí abre para ellos (si rebotara, quedarían encerrados fuera de su portal).
// El back-office ya tenía este gate; los dos portales no, y sus cuentas se
// quedaban con la provisional para siempre.
//
// Necesita la app arriba. Local:  pnpm dev  y luego
//   APP=http://localhost:3000 node --env-file=.env.local supabase/tests/gate_password_provisional.mjs
// Contra producción se puede apuntar APP a la URL desplegada.
// La sesión se arma aquí (cookie de @supabase/ssr): ninguna contraseña se
// imprime ni se teclea en ningún lado.

import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]

let ok = 0, fallos = 0
const check = (n, c, d = '') => { if (c) { ok++; console.log(`   ✔ ${n}`) } else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) } }

/** Cookie de sesión tal como la escribe @supabase/ssr (base64- + chunks de 3180). */
function cookiesDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)
}

async function pedir(ruta, cookies) {
  const r = await fetch(`${APP}${ruta}`, { headers: { cookie: cookies.join('; ') }, redirect: 'manual' })
  return { status: r.status, location: r.headers.get('location') }
}

// Fallar fuerte si la app no está: un "saltado" silencioso es justo la forma en
// que estos harness dejan de correr sin que nadie se entere (ADR-0023).
try {
  await fetch(`${APP}/login`)
} catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm dev) o pasa APP=<url>.\n`)
  process.exit(1)
}

const qa = await crearPosiciones([{ llave: 'emb', role: 'user', type: 'embajador', name: 'QA Embajador' }])
try {
  // Sesión real del embajador (el fixture ya hizo el password grant).
  const cookies = cookiesDeSesion(qa.emb.sesion)

  const svcFlag = async (v) => {
    const r = await fetch(`${U}/rest/v1/profiles?id=eq.${qa.emb.id}`, {
      method: 'PATCH',
      headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
                 'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal' },
      body: JSON.stringify({ must_change_password: v }),
    })
    if (!r.ok) throw new Error(`flag ${r.status}`)
  }

  // Con la provisional sin cambiar: el portal NO deja pasar.
  await svcFlag(true)
  const conFlag = await pedir('/embajador', cookies)
  check('con contraseña provisional, /embajador manda a /nueva-password',
    conFlag.status === 307 && conFlag.location?.includes('/nueva-password'),
    `HTTP ${conFlag.status} -> ${conFlag.location}`)

  // /nueva-password sí abre (si no, el embajador quedaría encerrado).
  const np = await pedir('/nueva-password', cookies)
  check('/nueva-password abre para el embajador (200, sin rebote)',
    np.status === 200, `HTTP ${np.status} -> ${np.location}`)

  // Ya con contraseña propia: pasa.
  await svcFlag(false)
  const sinFlag = await pedir('/embajador', cookies)
  check('sin el flag, /embajador entra normal', sinFlag.status === 200,
    `HTTP ${sinFlag.status} -> ${sinFlag.location}`)

  // Mismo gate en el portal de proveedor: se cambia el type de la cuenta.
  const rt = await fetch(`${U}/rest/v1/profiles?id=eq.${qa.emb.id}`, {
    method: 'PATCH',
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
               'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({ type: 'proveedor', must_change_password: true }),
  })
  if (!rt.ok) throw new Error(`type ${rt.status}`)
  const prov = await pedir('/proveedor', cookies)
  check('con provisional, /proveedor manda a /nueva-password',
    prov.status === 307 && prov.location?.includes('/nueva-password'),
    `HTTP ${prov.status} -> ${prov.location}`)
} finally {
  if (!(await qa.destruir())) fallos++
}
console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exitCode = fallos ? 1 : 0
