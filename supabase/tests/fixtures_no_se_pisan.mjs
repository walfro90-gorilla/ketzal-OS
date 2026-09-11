// HARD TESTING — dos corridas simultáneas no se destruyen las fixtures.
//
//   pnpm hard-test fixtures_no_se_pisan
//
// Qué defiende: `barrerRestos` borraba TODA cuenta con el prefijo efímero, así
// que dos sesiones corriendo la suite a la vez se barrían las fixtures. El modo
// caro no es el rojo por azar —ese te hace investigar— sino el VERDE por azar:
// si te borran las cuentas después de crearlas y antes de assertar, hay
// aserciones que pasan por vacuidad ("no vi filas ajenas" cuando no hay filas
// de nadie) y el tablero miente. Ahora:
//   · el barrido ignora las cuentas creadas hace menos de EDAD_RESTO_MS, así que
//     una corrida viva ajena nunca se toca;
//   · `destruir()` comprueba que sus cuentas siguen ahí y, si se las llevaron,
//     el harness sale NO CORRIÓ (código 75) en vez de verde.
//
// Este harness ES el caso raro que crea cuentas efímeras a mano: necesita una
// "corrida ajena" que no es suya. Las borra él mismo al final y lo verifica.

import { randomUUID } from 'node:crypto'
import { crearPosiciones, PREFIJO, CODIGO_NO_CORRIO } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' })

let ok = 0
let fallas = 0
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`   ✔ ${nombre}`) }
  else { fallas++; console.log(`   ✘ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

async function listar() {
  const r = await fetch(`${U}/auth/v1/admin/users?per_page=1000`, { headers: admin() })
  if (!r.ok) throw new Error(`list ${r.status}`)
  return (await r.json()).users ?? []
}
async function borrar(id) {
  await fetch(`${U}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin() })
}
async function crearAjena() {
  const email = `${PREFIJO}ajena.${randomUUID().slice(0, 8)}@ketzal.local`
  const r = await fetch(`${U}/auth/v1/admin/users`, {
    method: 'POST', headers: admin(),
    body: JSON.stringify({ email, password: randomUUID() + randomUUID(), email_confirm: true }),
  })
  if (!r.ok) throw new Error(`crear ajena: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return { ...(await r.json()), email }
}

console.log('\n▸ Fixtures: dos corridas simultáneas no se pisan\n')

// ── 1 · El barrido respeta una corrida ajena que acaba de nacer ─────────────
// La "otra corrida" ya tiene su cuenta arriba cuando la mía arranca y barre.
const ajena = await crearAjena()
let qa
try {
  qa = await crearPosiciones([{ llave: 'testigo', role: 'user', type: 'viajero', name: 'QA Testigo' }])
  const vivas = new Set((await listar()).map((u) => u.id))
  check('el barrido NO se lleva la cuenta efímera de una corrida ajena en curso',
    vivas.has(ajena.id), `la cuenta ${ajena.email} desapareció`)
  check('y sí crea las suyas', vivas.has(qa.testigo.id))
} finally {
  await borrar(ajena.id)
}

// ── 2 · destruir() detecta que le barrieron las cuentas ────────────────────
// Simulo exactamente el daño: le quito las cuentas a la corrida ANTES de que
// termine, como haría el `barrerRestos` viejo de otra sesión.
await borrar(qa.testigo.id)
const antes = process.exitCode
await qa.destruir()
check('destruir() marca NO CORRIÓ cuando otra corrida le barrió las cuentas',
  process.exitCode === CODIGO_NO_CORRIO, `exitCode quedó en ${process.exitCode}`)
process.exitCode = antes ?? 0

// ── 3 · El camino normal sigue saliendo verde ──────────────────────────────
const qa2 = await crearPosiciones([{ llave: 'normal', role: 'user', type: 'viajero', name: 'QA Normal' }])
const limpio = await qa2.destruir()
check('una corrida que termina sola se limpia y NO se marca NO CORRIÓ',
  limpio === true && process.exitCode !== CODIGO_NO_CORRIO, `limpio=${limpio} exitCode=${process.exitCode}`)

// ── 4 · No quedó nada MÍO vivo ─────────────────────────────────────────────
// Por id, no por prefijo: si otra sesión está corriendo su suite ahora mismo,
// sus cuentas efímeras están vivas con todo derecho y no son basura mía.
const mias = [ajena.id, qa.testigo.id, qa2.normal.id]
const vivasAlFinal = new Set((await listar()).map((u) => u.id))
const restantes = mias.filter((id) => vivasAlFinal.has(id))
check('limpieza verificada: 0 cuentas efímeras de este harness vivas',
  restantes.length === 0, `${restantes.length} viva(s)`)

console.log(`\n${fallas === 0 ? '✅' : '❌'} ${ok} pasaron, ${fallas} fallaron\n`)
process.exit(fallas === 0 ? 0 : 1)
