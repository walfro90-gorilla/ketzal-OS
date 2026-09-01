// CONVERSIÓN viajero → embajador, contra la app corriendo de verdad (b087).
//
// `conversion_viajero_embajador.sql` prueba que la BD no le quita nada al
// convertido. Esto prueba la otra mitad, la que solo se ve con la app arriba:
//
//   · que /mis-compras NO lo eche ahora que su `type` dice 'embajador'
//   · que cada portal tenga la salida al otro — si no, el convertido queda
//     encerrado en el que le tocó, porque '/' siempre lo manda al mismo
//   · que el enlace a "Mis compras" NO aparezca para el embajador que nunca
//     compró: una pestaña vacía es peor que no tenerla
//
// Necesita la app arriba:
//   pnpm build && pnpm start -p 3100
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/conversion_portales.mjs
//
// La sesión se arma aquí (cookie de @supabase/ssr): ninguna contraseña se
// imprime ni se teclea. Las fixtures son efímeras (ADR-0023) y la compra de
// prueba nace en 'draft' a propósito — un booking confirmado dispararía el
// motor de comisiones y dejaría asientos append-only que ya no se pueden borrar.

import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

const rest = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal', ...extra,
})

/** Cookie de sesión tal como la escribe @supabase/ssr (base64- + chunks de 3180). */
function cookiesDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)
}

async function pedir(ruta, cookies) {
  const r = await fetch(`${APP}${ruta}`, {
    headers: { cookie: cookies.join('; ') }, redirect: 'manual',
  })
  const html = r.status === 200 ? await r.text() : ''
  return { status: r.status, location: r.headers.get('location'), html }
}

// Fallar fuerte si la app no está: un "saltado" silencioso es justo la forma en
// que estos harness dejan de correr sin que nadie se entere (ADR-0023).
try {
  await fetch(`${APP}/login`)
} catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100) o pasa APP=<url>.\n`)
  process.exit(1)
}

console.log('\n▸ Conversión viajero → embajador (portales)\n')

const AG = crypto.randomUUID()
const SV = crypto.randomUUID()
const CL = crypto.randomUUID()
const BK = crypto.randomUUID()
const CODIGO = `QACONV${Math.floor(Math.random() * 100000)}`

const qa = await crearPosiciones([
  { llave: 'convertido', type: 'viajero', name: 'QA Convertido' },
  { llave: 'sinCompras', type: 'viajero', name: 'QA Sin compras' },
])

const borrarFila = async (tabla, id) => {
  const r = await fetch(`${U}/rest/v1/${tabla}?id=eq.${id}`, { method: 'DELETE', headers: rest() })
  if (!r.ok) console.error(`   ✘ no se borró ${tabla}/${id}: ${r.status}`)
  return r.ok
}
const crearFila = async (tabla, fila) => {
  const r = await fetch(`${U}/rest/v1/${tabla}`, {
    method: 'POST', headers: rest({ Prefer: 'return=minimal' }), body: JSON.stringify(fila),
  })
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 200)}`)
}
const parchar = async (tabla, id, campos) => {
  const r = await fetch(`${U}/rest/v1/${tabla}?id=eq.${id}`, {
    method: 'PATCH', headers: rest({ Prefer: 'return=minimal' }), body: JSON.stringify(campos),
  })
  if (!r.ok) throw new Error(`patch ${tabla}: ${r.status} ${(await r.text()).slice(0, 200)}`)
}

try {
  const cookies = cookiesDeSesion(qa.convertido.sesion)
  const cookiesSin = cookiesDeSesion(qa.sinCompras.sesion)

  // Una compra suya. 'draft' a propósito: no dispara el motor de comisiones,
  // así que al final se puede borrar de verdad (los asientos no).
  await crearFila('suppliers', {
    id: AG, name: `QA087 ${CODIGO}`, contact_email: `${CODIGO.toLowerCase()}@qa.local`,
    supplier_type: 'agency', commission_rate: 0,
  })
  await crearFila('services', { id: SV, supplier_id: AG, name: 'QA087 Tour', price: 3000 })
  await crearFila('customers', { id: CL, supplier_id: AG, full_name: 'QA087 Cliente' })
  await crearFila('bookings', {
    id: BK, selling_supplier_id: AG, owner_supplier_id: AG, customer_id: CL, service_id: SV,
    marketplace_customer_id: qa.convertido.id, num_pax: 1,
    subtotal: 3000, discount: 0, total: 3000, status: 'draft', channel: 'portal',
  })

  // ---------- Línea base: todavía es viajero ----------
  const base = await pedir('/mis-compras', cookies)
  check('el viajero entra a /mis-compras', base.status === 200, `status ${base.status}`)
  check(
    'siendo viajero no se le ofrece el portal de embajador',
    !base.html.includes('href="/embajador"'),
  )

  // ---------- La conversión (lo que hace `crearEmbajador`) ----------
  await parchar('profiles', qa.convertido.id, {
    type: 'embajador', referral_code: CODIGO, active: true,
  })

  const tras = await pedir('/mis-compras', cookies)
  check(
    'convertido en embajador, /mis-compras SIGUE abierto',
    tras.status === 200,
    `status ${tras.status}${tras.location ? ` → ${tras.location}` : ''}`,
  )
  check(
    'y desde ahí puede volver a su portal de ganancias',
    tras.html.includes('href="/embajador"'),
  )

  const portal = await pedir('/embajador', cookies)
  check('entra a /embajador', portal.status === 200, `status ${portal.status}`)
  check(
    'el que sí compró ve la salida a "Mis compras"',
    portal.html.includes('href="/mis-compras"'),
  )

  // ---------- Sin compras: nada de pestañas vacías ----------
  await parchar('profiles', qa.sinCompras.id, {
    type: 'embajador', referral_code: `${CODIGO}B`, active: true,
  })
  const portalSin = await pedir('/embajador', cookiesSin)
  check('el embajador sin compras entra a /embajador', portalSin.status === 200, `status ${portalSin.status}`)
  check(
    'y NO se le pinta un enlace a compras que no tiene',
    !portalSin.html.includes('href="/mis-compras"'),
  )

  // ---------- El gate del portal sigue firme para quien no es embajador ----------
  await parchar('profiles', qa.sinCompras.id, { type: 'viajero', referral_code: null })
  const echado = await pedir('/embajador', cookiesSin)
  check(
    'un viajero de a de veras sigue rebotando de /embajador',
    echado.status === 307 || echado.status === 302,
    `status ${echado.status}`,
  )
} finally {
  await borrarFila('bookings', BK)
  await borrarFila('customers', CL)
  await borrarFila('services', SV)
  await borrarFila('suppliers', AG)
  const limpio = await qa.destruir()
  if (!limpio) fallos++
}

console.log(`\n${fallos === 0 ? '✔' : '✘'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos === 0 ? 0 : 1)
