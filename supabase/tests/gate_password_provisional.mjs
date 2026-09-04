// Gate de CONTRASEÑA PROVISIONAL contra la app corriendo de verdad.
//
// `acceso_provisional.mjs` prueba el lado de Auth y la BD; esto prueba lo otro
// mitad: que los layouts NO dejan pasar a una cuenta que aún trae la contraseña
// que le dictaron, y que /nueva-password sí abre (si rebotara, quedaría
// encerrada fuera de su portal).
//
// Cubre las TRES superficies, no dos. Hasta el 2026-09-03 sólo probaba
// /embajador y /proveedor — los dos FUERA de `(ops)` — y el gate del
// back-office, que es el que más vale porque ahí se mueve el dinero, nunca se
// había medido. Se agregó al revisar un hallazgo de plataforma: bajo una ruta
// con `loading.tsx` (y `(ops)` tiene uno), un `redirect()` de PÁGINA se degrada
// a `<meta http-equiv="refresh">` con 200 en vez de dar 307. El de `(ops)` vive
// en el LAYOUT y sí corta — pero eso hay que medirlo, no suponerlo, y nada
// avisaba si dejaba de hacerlo.
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

  // ── El back-office ────────────────────────────────────────────────────────
  // La cuenta se vuelve agente de una agencia real: sin `supplier_id` el layout
  // de `(ops)` la rebotaría por otra razón y el caso no probaría el gate.
  const agencia = (await (await fetch(
    `${U}/rest/v1/suppliers?select=id&supplier_type=eq.agency&limit=1`,
    { headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Accept-Profile': 'ketzal' } },
  )).json())[0]
  if (!agencia?.id) throw new Error('ROTO: no hay ninguna agencia para armar el caso de (ops)')
  const ra = await fetch(`${U}/rest/v1/profiles?id=eq.${qa.emb.id}`, {
    method: 'PATCH',
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
               'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({ type: 'agente', supplier_id: agencia.id, must_change_password: true }),
  })
  if (!ra.ok) throw new Error(`agente ${ra.status}`)

  // Status Y contenido: en el camino RSC (un clic desde el menú) la respuesta es
  // 200 aunque el gate corte, y el redirect viaja DENTRO del flight. Mirar sólo
  // el status daría verde con el gate quitado.
  const OS = /Cobranza|Clawbot|Comisiones/
  for (const ruta of ['/dashboard', '/ventas', '/clientes']) {
    const directa = await fetch(`${APP}${ruta}`, {
      headers: { cookie: cookies.join('; ') }, redirect: 'manual' })
    check(`con provisional, ${ruta} manda a /nueva-password`,
      directa.status === 307 && directa.headers.get('location')?.includes('/nueva-password'),
      `HTTP ${directa.status} -> ${directa.headers.get('location')}`)

    // Lo que se exige es lo que importa: que NO llegue contenido del OS, y que
    // el corte lo dé el proxy con un 307 de verdad. Un 200 con `NEXT_REDIRECT`
    // adentro también "redirige" — y así viajaban 72 KB con clientes y cifras.
    const rsc = await fetch(`${APP}${ruta}`, {
      headers: { cookie: cookies.join('; '), RSC: '1' }, redirect: 'manual' })
    const cuerpo = await rsc.text()
    check(`con provisional, ${ruta} por clic (RSC) tampoco entra`,
      rsc.status === 307 &&
      rsc.headers.get('location')?.includes('/nueva-password') &&
      !OS.test(cuerpo),
      `HTTP ${rsc.status} -> ${rsc.headers.get('location')} · contenido del OS=${OS.test(cuerpo)}`)
  }

  // Y no queda encerrado: /nueva-password abre también desde el back-office.
  const npOps = await pedir('/nueva-password', cookies)
  check('/nueva-password abre para el agente del back-office (200, sin rebote)',
    npOps.status === 200, `HTTP ${npOps.status} -> ${npOps.location}`)

  // Sin el flag, el back-office entra normal (si no, el caso de arriba pasaría
  // por la razón equivocada).
  await svcFlag(false)
  const opsSinFlag = await pedir('/dashboard', cookies)
  check('sin el flag, /dashboard entra normal', opsSinFlag.status === 200,
    `HTTP ${opsSinFlag.status} -> ${opsSinFlag.location}`)
} finally {
  if (!(await qa.destruir())) fallos++
}
console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exitCode = fallos ? 1 : 0
