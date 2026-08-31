// Hard-test del acceso por CONTRASEÑA PROVISIONAL (sustituye al magic-link).
//
// Lo que de verdad hay que probar en vivo, porque nada de esto lo ve el
// compilador y el camino anterior llevaba meses roto sin que nadie lo notara:
//   1. la contraseña emitida SIRVE para entrar (password grant real);
//   2. el flag `must_change_password` lo ve EL PROPIO usuario a través de la
//      RLS — si no, el gate de /embajador y /proveedor nunca dispara y la
//      provisional se vuelve permanente en silencio;
//   3. `clear_password_change_flag` lo baja para un embajador (no solo agentes);
//   4. la contraseña vieja deja de servir al reemitir;
//   5. el magic-link SIGUE llegando al fragmento, que es el porqué de todo esto.
//
// Corre con: node --env-file=.env.local supabase/tests/acceso_provisional.mjs

import { randomInt } from 'node:crypto'
import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY

let ok = 0
let fallos = 0
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`   ✔ ${nombre}`) }
  else { fallos++; console.error(`   ✘ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const admin = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' })
// `Content-Profile` NO es opcional: en un POST a /rpc/ PostgREST resuelve el
// schema con ESE header, no con Accept-Profile. Sin él busca en `public`, no
// encuentra la función y responde 404 — que se lee igualito a "falta el GRANT".
const comoUsuario = (jwt) => ({
  apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal',
})

/** Login por contraseña. Devuelve el JWT, o null si Auth la rechazó. */
async function entrar(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) return null
  return (await r.json()).access_token ?? null
}

/** Lo mismo que `emitirCredencialProvisional`, contra la API real. */
async function emitir(userId) {
  const password = `Ketzal-${randomInt(100000, 999999)}`
  const rp = await fetch(`${U}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers: admin(), body: JSON.stringify({ password }),
  })
  if (!rp.ok) throw new Error(`updateUser ${rp.status}: ${(await rp.text()).slice(0, 200)}`)
  const rf = await fetch(`${U}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...admin(), 'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({ must_change_password: true }),
  })
  if (!rf.ok) throw new Error(`flag ${rf.status}: ${(await rf.text()).slice(0, 200)}`)
  return password
}

console.log('\n== Acceso por contraseña provisional ==\n')
const qa = await crearPosiciones([
  { llave: 'emb', role: 'user', type: 'embajador', name: 'QA Embajador' },
])
try {
  // 1) Emitir y entrar.
  const pass1 = await emitir(qa.emb.id)
  const jwt = await entrar(qa.emb.email, pass1)
  check('la contraseña provisional sirve para entrar', Boolean(jwt))
  if (!jwt) throw new Error('sin sesión no se puede seguir')

  // 2) El propio usuario ve su flag (si no, el gate del portal nunca dispara).
  const r = await fetch(
    `${U}/rest/v1/profiles?select=must_change_password,type&id=eq.${qa.emb.id}`,
    { headers: comoUsuario(jwt) },
  )
  const [fila] = r.ok ? await r.json() : [null]
  check('el embajador LEE su propio must_change_password por RLS', fila != null,
    `HTTP ${r.status}`)
  check('y viene en true recién emitida', fila?.must_change_password === true,
    `valor: ${JSON.stringify(fila?.must_change_password)}`)

  // 3) Bajar el flag como el propio usuario (lo que hace /nueva-password).
  const rc = await fetch(`${U}/rest/v1/rpc/clear_password_change_flag`, {
    method: 'POST', headers: comoUsuario(jwt), body: '{}',
  })
  check('clear_password_change_flag corre para un embajador', rc.ok, `HTTP ${rc.status}`)
  const [tras] = await (await fetch(
    `${U}/rest/v1/profiles?select=must_change_password&id=eq.${qa.emb.id}`,
    { headers: comoUsuario(jwt) },
  )).json()
  check('el flag quedó en false', tras?.must_change_password === false,
    `valor: ${JSON.stringify(tras?.must_change_password)}`)

  // 4) Reemitir invalida la anterior (es lo que promete el confirm de la UI).
  const pass2 = await emitir(qa.emb.id)
  check('la contraseña NUEVA entra', Boolean(await entrar(qa.emb.email, pass2)))
  check('la contraseña VIEJA ya no entra', (await entrar(qa.emb.email, pass1)) === null)

  // 5) El magic-link sigue aterrizando en el fragmento: no es una regresión que
  //    se pueda arreglar del lado del callback sin una página cliente.
  const rl = await fetch(`${U}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: admin(),
    body: JSON.stringify({
      type: 'magiclink', email: qa.emb.email,
      redirect_to: 'https://ketzal-os.vercel.app/auth/callback',
    }),
  })
  const link = (await rl.json()).action_link
  const v = await fetch(link, { redirect: 'manual' })
  const loc = v.headers.get('location') ?? ''
  // Solo se mira la FORMA de la URL: ningún token se imprime.
  check('el magic-link manda la sesión en el fragmento, no en ?code=',
    loc.includes('#access_token=') && !loc.includes('?code='))
  const v2 = await fetch(link, { redirect: 'manual' })
  check('y es de un solo uso (el crawler de WhatsApp lo quema)',
    (v2.headers.get('location') ?? '').includes('error'))
} finally {
  if (!(await qa.destruir())) fallos++
}

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exitCode = fallos === 0 ? 0 : 1
