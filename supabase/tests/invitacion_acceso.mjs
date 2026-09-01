// Hard-test de la INVITACIÓN de agentes (b078 + ADR-0027).
//
// El bug que esto protege, medido en vivo antes de b078: un invitado que entra
// por CONTRASEÑA no pasa por `/auth/callback`, así que nadie llama
// `ensure_profile()` antes. `accept_pending_invitation` hacía un UPDATE sobre
// una fila inexistente —0 filas, ningún error— y AUN ASÍ marcaba la invitación
// aceptada. La persona quedaba `type='viajero'` para siempre, aterrizaba en
// /mis-compras, y su invitación desaparecía de /equipo como si todo hubiera
// salido bien. Sin un solo error en ningún lado.
//
// Corre con: node --env-file=.env.local supabase/tests/invitacion_acceso.mjs
// Con la app arriba se corren además los checks de ruteo:
//   APP=http://localhost:3000 node --env-file=.env.local supabase/tests/invitacion_acceso.mjs

import { randomUUID } from 'node:crypto'
import { PREFIJO } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP ?? null

let ok = 0
let fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

const adm = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }
const rest = { ...adm, 'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal' }
const usr = (j) => ({
  apikey: ANON, Authorization: `Bearer ${j}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal',
})

const creados = { usuarios: [], invitaciones: [] }

async function agencias() {
  const r = await fetch(`${U}/rest/v1/suppliers?select=id,name&supplier_type=eq.agency&order=name&limit=2`, { headers: rest })
  const a = await r.json()
  if (a.length < 2) throw new Error('se necesitan 2 agencias para probar el cruce')
  return a
}

/** Cuenta de Auth SIN profile: así queda un invitado al que le dan acceso. */
async function cuentaSinPerfil() {
  const email = `${PREFIJO}invit.${randomUUID().slice(0, 8)}@ketzal.local`
  const password = `${randomUUID()}${randomUUID()}`
  const r = await fetch(`${U}/auth/v1/admin/users`, {
    method: 'POST', headers: adm,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`crear ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const { id } = await r.json()
  creados.usuarios.push(id)
  return { id, email, password }
}

async function invitar(email, supplier_id, role = 'user') {
  const r = await fetch(`${U}/rest/v1/agency_invitations`, {
    method: 'POST', headers: { ...rest, Prefer: 'return=representation' },
    body: JSON.stringify({ email, supplier_id, role, status: 'pending' }),
  })
  if (!r.ok) throw new Error(`invitar ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const [inv] = await r.json()
  creados.invitaciones.push(inv.id)
  return inv
}

async function entrar(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return r.ok ? await r.json() : null
}

const perfil = async (id) =>
  (await (await fetch(
    `${U}/rest/v1/profiles?select=type,role,supplier_id,active,must_change_password&id=eq.${id}`,
    { headers: rest },
  )).json())[0] ?? null

const estadoInvitacion = async (id) =>
  (await (await fetch(`${U}/rest/v1/agency_invitations?select=status&id=eq.${id}`, { headers: rest })).json())[0]?.status

const aceptar = (jwt) =>
  fetch(`${U}/rest/v1/rpc/accept_pending_invitation`, { method: 'POST', headers: usr(jwt), body: '{}' })

console.log('\n== Invitación de agentes: acceso y auto-unión ==\n')
try {
  const [agA, agB] = await agencias()

  // 1) EL BUG: invitado sin profile que entra por contraseña. Antes de b078 esto
  //    lo dejaba viajero y quemaba la invitación.
  {
    const c = await cuentaSinPerfil()
    const inv = await invitar(c.email, agA.id, 'user')
    check('la cuenta arranca SIN profile', (await perfil(c.id)) === null)

    const s = await entrar(c.email, c.password)
    check('entra con su contraseña', Boolean(s?.access_token))
    const r = await aceptar(s.access_token)
    check('accept_pending_invitation responde ok', r.ok, `HTTP ${r.status}`)

    const p = await perfil(c.id)
    check('CREA el profile (no lo deja sin fila)', p !== null)
    check("y nace como 'agente', no como viajero", p?.type === 'agente', `type: ${p?.type}`)
    check('con la agencia de la invitación', p?.supplier_id === agA.id, `supplier: ${p?.supplier_id}`)
    check('con el rol invitado', p?.role === 'user', `role: ${p?.role}`)
    check('y activo', p?.active === true)
    check('la invitación queda aceptada', (await estadoInvitacion(inv.id)) === 'accepted')
  }

  // 2) El rol invitado se respeta (no todo el mundo entra como 'user').
  {
    const c = await cuentaSinPerfil()
    await invitar(c.email, agA.id, 'admin')
    const s = await entrar(c.email, c.password)
    await aceptar(s.access_token)
    check("invitado como admin entra como admin", (await perfil(c.id))?.role === 'admin')
  }

  // 3) NO arrebata: quien ya es de otra agencia no se mueve, y su invitación
  //    NO se quema (queda pendiente para que alguien la revise o la revoque).
  {
    const c = await cuentaSinPerfil()
    await invitar(c.email, agA.id, 'user')
    const s = await entrar(c.email, c.password)
    await aceptar(s.access_token)               // se une a la agencia A
    const inv2 = await invitar(c.email, agB.id, 'admin')  // ahora lo invita B
    const r2 = await aceptar(s.access_token)
    const cuerpo = (await r2.text()).trim()
    check('la 2ª invitación NO lo arrebata', cuerpo === 'null', `devolvió ${cuerpo}`)
    check('sigue en su agencia original', (await perfil(c.id))?.supplier_id === agA.id)
    check('y esa invitación NO se quema', (await estadoInvitacion(inv2.id)) === 'pending')
  }

  // 4) Idempotente: llamarlo dos veces no rompe ni duplica.
  {
    const c = await cuentaSinPerfil()
    await invitar(c.email, agA.id, 'user')
    const s = await entrar(c.email, c.password)
    await aceptar(s.access_token)
    const r = await aceptar(s.access_token)
    check('segunda llamada es no-op', (await r.text()).trim() === 'null')
    check('el perfil sigue intacto', (await perfil(c.id))?.supplier_id === agA.id)
  }

  // 5) Sin invitación pendiente no pasa nada (no fabrica agentes).
  {
    const c = await cuentaSinPerfil()
    const s = await entrar(c.email, c.password)
    const r = await aceptar(s.access_token)
    check('sin invitación no crea nada', (await r.text()).trim() === 'null')
    check('y sigue sin profile', (await perfil(c.id)) === null)
  }

  // 6) Con la app arriba: el invitado con contraseña provisional aterriza en el
  //    back-office (no en /mis-compras) y no pasa sin fijar la suya.
  if (APP) {
    const ref = new URL(U).hostname.split('.')[0]
    const cookiesDe = (ses) => {
      const raw = 'base64-' + Buffer.from(JSON.stringify(ses)).toString('base64')
      const t = raw.match(/.{1,3180}/g) ?? [raw]
      return t.length === 1
        ? [`sb-${ref}-auth-token=${t[0]}`]
        : t.map((x, i) => `sb-${ref}-auth-token.${i}=${x}`)
    }
    const pedir = async (ruta, cookies) => {
      const r = await fetch(`${APP}${ruta}`, { headers: { cookie: cookies.join('; ') }, redirect: 'manual' })
      return { status: r.status, location: r.headers.get('location') }
    }

    const c = await cuentaSinPerfil()
    await invitar(c.email, agA.id, 'user')
    const s = await entrar(c.email, c.password)
    await aceptar(s.access_token)
    // Lo que deja `generarAccesoInvitado`: contraseña provisional por cambiar.
    await fetch(`${U}/rest/v1/profiles?id=eq.${c.id}`, {
      method: 'PATCH', headers: rest, body: JSON.stringify({ must_change_password: true }),
    })
    const ck = cookiesDe(s)

    const d1 = await pedir('/dashboard', ck)
    check('con provisional, /dashboard manda a /nueva-password',
      d1.status === 307 && d1.location?.includes('/nueva-password'),
      `HTTP ${d1.status} -> ${d1.location}`)

    await fetch(`${U}/rest/v1/profiles?id=eq.${c.id}`, {
      method: 'PATCH', headers: rest, body: JSON.stringify({ must_change_password: false }),
    })
    const d2 = await pedir('/dashboard', ck)
    check('ya con su contraseña, ENTRA al back-office (no a /mis-compras)',
      d2.status === 200, `HTTP ${d2.status} -> ${d2.location}`)
  } else {
    console.log('   · checks de ruteo omitidos: pasa APP=<url> con la app arriba')
  }
} finally {
  for (const id of creados.invitaciones) {
    await fetch(`${U}/rest/v1/agency_invitations?id=eq.${id}`, { method: 'DELETE', headers: rest })
  }
  for (const id of creados.usuarios) {
    await fetch(`${U}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: adm })
  }
  // Verificar, no suponer.
  const vivos = (await (await fetch(`${U}/auth/v1/admin/users?per_page=1000`, { headers: adm })).json())
    .users.filter((u) => u.email?.startsWith(PREFIJO))
  const invs = await (await fetch(
    `${U}/rest/v1/agency_invitations?select=id&email=like.${PREFIJO}*`, { headers: rest })).json()
  if (vivos.length || invs.length) {
    fallos++
    console.error(`   ✘ quedó basura: ${vivos.length} cuentas, ${invs.length} invitaciones`)
  } else {
    console.log('   ✔ limpieza verificada: 0 cuentas y 0 invitaciones efímeras')
  }
}

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exitCode = fallos === 0 ? 0 : 1
