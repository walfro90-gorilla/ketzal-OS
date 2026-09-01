// Alta de embajador sobre un correo QUE YA TIENE CUENTA (b087), ejerciendo la
// server action `crearEmbajador` de verdad — no una copia de su lógica.
//
// Antes, ese correo reventaba en `admin.createUser` y la acción devolvía
// "¿correo ya registrado?": el camino viajero→embajador simplemente no existía,
// justo el que más importa (a quien ya te compró es a quien le pides que te
// recomiende).
//
// Se llama por HTTP como lo hace el navegador: POST a la página con el header
// `Next-Action`. El id de la acción no se escribe a mano — se busca en el
// manifiesto del build mandándole a cada candidata un payload vacío, que la
// acción rechaza en su primer guard sin tocar nada. Así el harness no se rompe
// cuando el hash cambie en el siguiente build.
//
// Necesita el build servido (los ids salen de .next/):
//   pnpm build && pnpm start -p 3100
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/conversion_alta.mjs

import { readFileSync } from 'node:fs'
import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]
const RUTA = '/comisiones'

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

const rest = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal', ...extra,
})

function cookieDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return (trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)).join('; ')
}

let manifiesto
try {
  manifiesto = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'))
} catch {
  console.error('\n✘ No hay build en .next/. Corre `pnpm build` antes.\n')
  process.exit(1)
}
const candidatas = Object.entries(manifiesto.node || {})
  .filter(([, v]) => Object.keys(v.workers || {}).join(',') === `app/(ops)${RUTA}/page`)
  .map(([id]) => id)

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Alta de embajador sobre una cuenta que ya existe\n')

const CODIGO = `QAALTA${Math.floor(Math.random() * 100000)}`
const qa = await crearPosiciones([
  { llave: 'jefe', role: 'superadmin', type: 'agente', name: 'QA Jefe' },
  { llave: 'cliente', type: 'viajero', name: 'QA Cliente Fiel' },
  { llave: 'colega', role: 'admin', type: 'agente', name: 'QA Colega' },
])
const cookie = cookieDeSesion(qa.jefe.sesion)

async function accion(id, args) {
  const r = await fetch(`${APP}${RUTA}`, {
    method: 'POST',
    headers: { 'Next-Action': id, 'Content-Type': 'text/plain;charset=UTF-8', cookie },
    body: JSON.stringify(args),
  })
  return await r.text()
}

try {
  // ---------- Localizar la acción sin hardcodear su hash ----------
  let idAlta = null
  for (const id of candidatas) {
    const cuerpo = await accion(id, [{}])
    if (cuerpo.includes('Escribe el nombre del embajador')) { idAlta = id; break }
  }
  check('se localizó `crearEmbajador` en el build', Boolean(idAlta),
    `ninguna de ${candidatas.length} candidatas respondió su primer guard`)
  if (!idAlta) throw new Error('sin acción que probar')

  const perfil = async (id) => {
    const r = await fetch(
      `${U}/rest/v1/profiles?id=eq.${id}&select=type,name,referral_code,must_change_password`,
      { headers: rest() })
    return (await r.json())[0]
  }
  // ---------- El caso: el correo YA es de un viajero ----------
  const antes = await perfil(qa.cliente.id)
  const cuerpo = await accion(idAlta, [{
    nombre: 'QA Cliente Fiel', codigo: CODIGO, email: qa.cliente.email, supplierId: '',
  }])

  check(
    'no truena con "correo ya registrado"',
    !cuerpo.includes('correo ya registrado'),
    'la acción sigue rechazando a quien ya tiene cuenta',
  )
  check(
    'no le inventa una contraseña provisional (ADR-0028)',
    !cuerpo.includes('"password"'),
    'devolvió credenciales para alguien que ya tenía la suya',
  )

  const dsp = await perfil(qa.cliente.id)
  check('la cuenta existente quedó como embajador', dsp?.type === 'embajador', `type=${dsp?.type}`)
  check('con su código de referido', dsp?.referral_code === CODIGO, `codigo=${dsp?.referral_code}`)
  check(
    'y NO se le marcó "debe cambiar contraseña"',
    dsp?.must_change_password === false,
    'lo mandaría a fijar una contraseña que ya tiene',
  )
  check('era viajero antes de todo esto', antes?.type === 'viajero', `antes=${antes?.type}`)

  // ---------- Lo que NO debe convertirse ----------
  const yaEmb = await accion(idAlta, [{
    nombre: 'Otra vez', codigo: `${CODIGO}X`, email: qa.cliente.email, supplierId: '',
  }])
  check('un embajador repetido se rechaza con su motivo', yaEmb.includes('ya es embajador'))

  const agente = await accion(idAlta, [{
    nombre: 'QA Colega', codigo: `${CODIGO}Y`, email: qa.colega.email, supplierId: '',
  }])
  check(
    'convertir a alguien del equipo se rechaza (perdería el back-office)',
    agente.includes('back-office'),
  )
  const colega = await perfil(qa.colega.id)
  check('y su cuenta quedó intacta', colega?.type === 'agente', `type=${colega?.type}`)
} finally {
  const limpio = await qa.destruir()
  if (!limpio) fallos++
}

console.log(`\n${fallos === 0 ? '✔' : '✘'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos === 0 ? 0 : 1)
