// El costeo abre para el admin, con su contenido, y no para el agente.
//
// Por qué existe (ADR-0055 + ADR-0043): `costeo.sql` prueba la RLS y los CHECK
// en la BD; esto prueba lo que ve una PERSONA. Un 200 no dice nada (la pantalla
// de error de Next también responde 200 en el camino RSC), así que se exige el
// CONTENIDO del costeo en las dos formas de llegar: URL directa y clic (RSC).
// Y se afirma por HTTP, con JWT real, lo que un agente o un anónimo reciben si
// pegan directo a PostgREST: cero filas, y nada de escritura.
//
//   pnpm dev   (o pnpm build && pnpm start -p 3100)
//   APP=http://localhost:3000 node --env-file=.env.local supabase/tests/costeo_pagina.mjs

import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
const como = (token, extra = {}) => ({
  apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal', ...extra,
})

/** La cookie que arma @supabase/ssr, partida en trozos como lo hace el navegador. */
function cookieDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return (trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)).join('; ')
}

async function crear(tabla, fila) {
  const r = await fetch(`${U}/rest/v1/${tabla}`, {
    method: 'POST', headers: rest({ Prefer: 'return=representation' }), body: JSON.stringify(fila),
  })
  if (!r.ok) throw new Error(`crear ${tabla}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json())[0]
}
const borrar = (tabla, id, col = 'id') =>
  fetch(`${U}/rest/v1/${tabla}?${col}=eq.${id}`, { method: 'DELETE', headers: rest() })
const contar = async (tabla, col, id) =>
  (await (await fetch(`${U}/rest/v1/${tabla}?select=${col}&${col}=eq.${id}`, { headers: rest() })).json()).length

const TARIFAS = [
  { key: 'habitacion-estandar', label: 'Habitación estándar', unit: 'habitacion', cost_by_pack: { doble: 1200, sencilla: 2000 } },
  { key: 'sprinter', label: 'Sprinter 15 pax', unit: 'grupo', cost: 8000, cap: 15 },
]
// Lo que la página del costeo pinta cuando de verdad se renderizó. Las del
// servidor viajan en los dos caminos; las del form (`'use client'`) solo en el
// HTML de la URL directa: en el payload RSC un componente de cliente va como
// referencia + props, no como texto.
const MARCAS_SERVIDOR = ['Costeo ·', 'a cuántos pasajeros empatas', 'QA costeo Hotel']
const MARCAS_FORM = ['Parámetros', 'Costos del viaje', 'Resultado a', 'Punto de equilibrio']

console.log('\n▸ Costeo: la página y la RLS por HTTP (ADR-0055)\n')

const corrida = Math.random().toString(36).slice(2, 8)
let agencia, hotel, servicio, salida, qa
try {
  agencia = await crear('suppliers', {
    name: `QA costeo Agencia ${corrida}`, contact_email: `qa.costeo.${corrida}@ketzal.local`,
    supplier_type: 'agency', commission_rate: 0,
  })
  qa = await crearPosiciones([
    { llave: 'admin', role: 'admin', type: 'agente', supplier_id: agencia.id },
    { llave: 'agente', role: 'user', type: 'agente', supplier_id: agencia.id },
  ])
  hotel = await crear('suppliers', {
    name: 'QA costeo Hotel', contact_email: `qa.costeo.hotel.${corrida}@ketzal.local`,
    supplier_type: 'hotel', commission_rate: 0, owner_supplier_id: agencia.id,
  })
  servicio = await crear('services', {
    supplier_id: agencia.id, name: `QA costeo Tour ${corrida}`, price: 3500, published: false,
    max_capacity: 20, hotel_provider_id: hotel.id,
    packs: [{ key: 'doble', label: 'Doble (2 personas)', price: 3500 }, { key: 'sencilla', label: 'Sencilla (1 persona)', price: 5000 }],
    add_ons: [{ key: 'tirolesa', label: 'Tirolesa', price: 450 }],
    itinerary: [{ title: 'Día 1', description: '' }, { title: 'Día 2', description: '' }, { title: 'Día 3', description: '' }],
  })
  const en30 = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10)
  salida = await crear('service_departures', { service_id: servicio.id, departs_on: en30, max_capacity: 20, seats_taken: 12 })

  // ---------------------------------------------------- RLS por HTTP ---
  const admin = qa.admin.token, agente = qa.agente.token
  const up = await fetch(`${U}/rest/v1/supplier_rate_cards`, {
    method: 'POST', headers: como(admin, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ supplier_id: hotel.id, rates: TARIFAS }),
  })
  check('el admin escribe el tarifario de su proveedor por PostgREST', up.status === 201, String(up.status))
  const leidoAdmin = await (await fetch(`${U}/rest/v1/supplier_rate_cards?supplier_id=eq.${hotel.id}`, { headers: como(admin) })).json()
  check('…y lo lee', Array.isArray(leidoAdmin) && leidoAdmin.length === 1 && leidoAdmin[0].rates.length === 2)

  const leidoAgente = await (await fetch(`${U}/rest/v1/supplier_rate_cards?supplier_id=eq.${hotel.id}`, { headers: como(agente) })).json()
  check('el AGENTE de la misma agencia recibe cero filas', Array.isArray(leidoAgente) && leidoAgente.length === 0, JSON.stringify(leidoAgente).slice(0, 80))
  const escribeAgente = await fetch(`${U}/rest/v1/service_costings`, {
    method: 'POST', headers: como(agente, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ service_id: servicio.id, doc: { plan_pax: 10, nights: 2, days: 3, margin_pct: 30, lines: [], addon_costs: {} } }),
  })
  check('el AGENTE no puede escribir un costeo', escribeAgente.status >= 400, String(escribeAgente.status))
  const anon = await fetch(`${U}/rest/v1/supplier_rate_cards?select=supplier_id`, { headers: { apikey: ANON, 'Accept-Profile': 'ketzal' } })
  const cuerpoAnon = await anon.text()
  check('el ANÓNIMO no lee tarifarios', anon.status >= 400 || cuerpoAnon.trim() === '[]', `${anon.status} ${cuerpoAnon.slice(0, 60)}`)

  // ------------------------------------------------------- páginas ---
  const cookieAdmin = cookieDeSesion(qa.admin.sesion)
  const cookieAgente = cookieDeSesion(qa.agente.sesion)
  for (const [modo, extra, marcas] of [
    ['URL directa', {}, [...MARCAS_SERVIDOR, ...MARCAS_FORM]],
    ['clic (RSC)', { RSC: '1' }, MARCAS_SERVIDOR],
  ]) {
    const r = await fetch(`${APP}/servicios/${servicio.id}/costeo`, { headers: { cookie: cookieAdmin, ...extra }, redirect: 'manual' })
    const cuerpo = await r.text()
    const faltan = marcas.filter((m) => !cuerpo.includes(m))
    check(`el costeo abre para el admin por ${modo} con su contenido`, r.status === 200 && faltan.length === 0,
      `${r.status}; faltan: ${faltan.join(', ')}`)
    // El tarifario del hotel llega al picker (embed suppliers → supplier_rate_cards).
    check(`…y trae las tarifas del proveedor (${modo})`, cuerpo.includes('Habitación estándar') && cuerpo.includes('Sprinter 15 pax'))
  }
  const ag = await fetch(`${APP}/servicios/${servicio.id}/costeo`, { headers: { cookie: cookieAgente }, redirect: 'manual' })
  check('el AGENTE no llega a la página: el proxy lo manda al inicio', ag.status === 307 && /\/(\?|$)/.test(new URL(ag.headers.get('location') ?? '/x', APP).pathname + '?'),
    `${ag.status} → ${ag.headers.get('location')}`)

  const prov = await fetch(`${APP}/proveedores/${hotel.id}`, { headers: { cookie: cookieAdmin }, redirect: 'manual' })
  const htmlProv = prov.status === 200 ? await prov.text() : ''
  check('la ficha del proveedor pinta el Tarifario con sus tarifas guardadas',
    prov.status === 200 && htmlProv.includes('Tarifario') && htmlProv.includes('Habitación estándar'), String(prov.status))
  const serv = await fetch(`${APP}/servicios/${servicio.id}`, { headers: { cookie: cookieAdmin }, redirect: 'manual' })
  const htmlServ = serv.status === 200 ? await serv.text() : ''
  check('la página del servicio enlaza al costeo', serv.status === 200 && htmlServ.includes(`/servicios/${servicio.id}/costeo`), String(serv.status))
} catch (e) {
  fallos++
  console.error(`   ✘ el harness reventó: ${String(e.message ?? e).split('\n')[0]}`)
} finally {
  // Limpieza en orden de dependencias, y VERIFICADA.
  if (salida) await borrar('service_departures', salida.id)
  if (servicio) await borrar('services', servicio.id)
  if (hotel) await borrar('suppliers', hotel.id)
  if (qa) await qa.destruir()
  if (agencia) await borrar('suppliers', agencia.id)
  const restos = (servicio ? await contar('service_costings', 'service_id', servicio.id) : 0)
    + (hotel ? await contar('supplier_rate_cards', 'supplier_id', hotel.id) : 0)
    + (servicio ? await contar('services', 'id', servicio.id) : 0)
    + (agencia ? await contar('suppliers', 'id', agencia.id) : 0)
  if (restos === 0) console.log('   ✔ limpieza verificada: 0 filas de prueba')
  else { fallos++; console.error(`   ✘ QUEDARON ${restos} filas de prueba`) }
}

console.log(`\n   ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
