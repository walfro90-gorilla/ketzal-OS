// HARD TESTING — el MCP da de alta proveedores y su tarifario (ADR-0055 / ADR-0056).
//
//   pnpm --dir mcp build && pnpm hard-test mcp_proveedores
//
// Qué defiende: `ketzal_crear_proveedor` crea un PROVEEDOR colgado de la agencia
// de quien pregunta (nunca una agencia: el esquema rechaza `tipo: agency`), se
// niega ante un nombre parecido salvo `forzar`, y exige un contacto.
// `ketzal_tarifario_guardar` mezcla por key, reemplaza si se le pide, acepta la
// unidad `noche` (b100) y la RLS impide que el admin de OTRA agencia escriba el
// tarifario. Se ejecutan los handlers compilados (`mcp/dist`) con el JWT de
// cuentas efímeras, igual que lo hace el asistente del OS (tokenScope).
//
// Cuentas por `crearPosiciones`; agencias, proveedores y tarifarios se crean
// aquí y se borran al final, verificando que queden 0.

import { existsSync } from 'node:fs'
import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!existsSync('mcp/dist/tools/proveedores.js')) {
  console.error('\n✘ Falta mcp/dist. Corre `pnpm --dir mcp build` antes.\n')
  process.exit(1)
}
const { tools } = await import('../../mcp/dist/tools/proveedores.js')
const { tokenScope } = await import('../../mcp/dist/session.js')
const tool = (n) => tools.find((t) => t.name === n)

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}
const rest = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal', ...extra,
})
async function svc(method, path, body) {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    method, headers: rest({ Prefer: 'return=representation' }), body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
/** Corre un handler como haría el asistente: con el JWT de la persona en el scope. */
const como = (sesion, nombre, args) => tokenScope.run(sesion.token, () => tool(nombre).handler(args))
async function falla(fn) {
  try { await fn(); return null } catch (e) { return e?.message ?? String(e) }
}

console.log('\n▸ MCP: alta de proveedor + tarifario, con RLS por agencia\n')

const [agA] = await svc('POST', 'suppliers', { name: 'QA MCP Agencia A', supplier_type: 'agency', commission_rate: 0, contact_email: 'qa.mcp.a@ketzal.local' })
const [agB] = await svc('POST', 'suppliers', { name: 'QA MCP Agencia B', supplier_type: 'agency', commission_rate: 0, contact_email: 'qa.mcp.b@ketzal.local' })
const creados = []
const qa = await crearPosiciones([
  { llave: 'adminA', role: 'admin', type: 'agente', supplier_id: agA.id, name: 'QA Admin A' },
  { llave: 'adminB', role: 'admin', type: 'agente', supplier_id: agB.id, name: 'QA Admin B' },
])

try {
  // ── crear ──────────────────────────────────────────────────────────────
  const r1 = await como(qa.adminA, 'ketzal_crear_proveedor', {
    nombre: 'QA Cabañas Rancho San Lorenzo', tipo: 'hotel', subtipo: 'cabañas y camping',
    telefono: '55.54.59.82.88', ciudad: 'Basaseachi', estado: 'Chihuahua',
    condiciones: 'Anticipo 50%; liquidación 5 días antes.',
    pago: { titular: 'QA Titular', clabe: '0143-2060-5884-8187-70' },
  })
  creados.push(r1.proveedor.id)
  check('crea el proveedor colgado de la agencia de quien pregunta',
    r1.proveedor.owner_supplier_id === agA.id && r1.proveedor.supplier_type === 'hotel',
    JSON.stringify(r1.proveedor).slice(0, 200))
  check('teléfono en dígitos y condiciones + CLABE en info',
    r1.proveedor.phone_number === '5554598288' && r1.proveedor.info?.condiciones?.startsWith('Anticipo') && r1.proveedor.info?.spei_clabe === '014320605884818770')

  const dup = await falla(() => como(qa.adminA, 'ketzal_crear_proveedor', { nombre: 'rancho san lorenzo', tipo: 'hotel', telefono: '1' }))
  check('un nombre parecido se rechaza y dice cuál existe', Boolean(dup) && dup.includes(r1.proveedor.id), dup ?? 'no falló')

  const r2 = await como(qa.adminA, 'ketzal_crear_proveedor', { nombre: 'Rancho San Lorenzo', tipo: 'otro', telefono: '6141234567', forzar: true })
  creados.push(r2.proveedor.id)
  check('con forzar sí crea otro', r2.proveedor.id !== r1.proveedor.id)

  const sinContacto = await falla(() => como(qa.adminA, 'ketzal_crear_proveedor', { nombre: 'QA Sin Contacto', tipo: 'otro' }))
  check('sin teléfono ni correo no se crea', Boolean(sinContacto) && /contacto/i.test(sinContacto), sinContacto ?? 'no falló')

  const agencia = await falla(() => como(qa.adminA, 'ketzal_crear_proveedor', { nombre: 'QA Agencia Colada', tipo: 'agency', telefono: '1' }))
  check('tipo agency lo rechaza el esquema (nunca crea agencias)', Boolean(agencia), 'no falló')

  // ── tarifario ──────────────────────────────────────────────────────────
  const t1 = await como(qa.adminA, 'ketzal_tarifario_guardar', {
    proveedor_id: r1.proveedor.id,
    tarifas: [
      { label: 'Cabaña 8 pax', unidad: 'noche', costo: 1900, cupo: 8 },
      { label: 'Acceso al parque', unidad: 'pax', costo: 65 },
    ],
  })
  check('guarda dos tarifas, una por noche con cupo (b100)',
    t1.total === 2 && t1.tarifas.some((x) => x.unit === 'noche' && x.cap === 8 && x.cost === 1900), JSON.stringify(t1).slice(0, 200))

  const t2 = await como(qa.adminA, 'ketzal_tarifario_guardar', {
    proveedor_id: r1.proveedor.id,
    tarifas: [{ label: 'Camping por vehículo', unidad: 'noche', costo: 600, cupo: 5 }],
  })
  check('agregar una tarifa mezcla: quedan 3, no 1', t2.total === 3 && t2.modo === 'mezclado', `total=${t2.total}`)

  const leido = await como(qa.adminA, 'ketzal_tarifario', { proveedor_id: r1.proveedor.id })
  check('ketzal_tarifario devuelve las 3', leido.tarifas.length === 3)

  const lista = await como(qa.adminA, 'ketzal_proveedores', { texto: 'rancho san lorenzo' })
  const enLista = lista.proveedores.find((p) => p.id === r1.proveedor.id)
  check('ketzal_proveedores lo encuentra sin acentos y cuenta sus tarifas', Boolean(enLista) && enLista.num_tarifas === 3, JSON.stringify(lista).slice(0, 200))

  const t3 = await como(qa.adminA, 'ketzal_tarifario_guardar', {
    proveedor_id: r1.proveedor.id, reemplazar: true,
    tarifas: [{ label: 'Cabaña 8 pax', unidad: 'noche', costo: 2100, cupo: 8 }],
  })
  check('reemplazar deja solo lo mandado', t3.total === 1 && t3.tarifas[0].cost === 2100)

  const mala = await falla(() => como(qa.adminA, 'ketzal_tarifario_guardar', {
    proveedor_id: r1.proveedor.id, tarifas: [{ label: 'Hora de guía', unidad: 'hora', costo: 100 }],
  }))
  check('una unidad desconocida no entra', Boolean(mala), 'no falló')

  // ── RLS: otra agencia ──────────────────────────────────────────────────
  const ajeno = await falla(() => como(qa.adminB, 'ketzal_tarifario_guardar', {
    proveedor_id: r1.proveedor.id, tarifas: [{ label: 'Intruso', unidad: 'pax', costo: 1 }],
  }))
  check('el admin de OTRA agencia no escribe el tarifario', Boolean(ajeno), 'no falló')
  const [tarjeta] = await svc('GET', `supplier_rate_cards?supplier_id=eq.${r1.proveedor.id}&select=rates`)
  check('…y el tarifario quedó intacto', tarjeta?.rates?.length === 1 && tarjeta.rates[0].cost === 2100)
} finally {
  // ── limpieza ───────────────────────────────────────────────────────────
  const limpioUsuarios = await qa.destruir()
  if (!limpioUsuarios) fallos++
  if (creados.length) {
    await svc('DELETE', `supplier_rate_cards?supplier_id=in.(${creados.join(',')})`).catch(() => {})
    await svc('DELETE', `suppliers?id=in.(${creados.join(',')})`).catch((e) => console.error('   ✘', e.message))
  }
  await svc('DELETE', `suppliers?id=in.(${agA.id},${agB.id})`).catch((e) => console.error('   ✘', e.message))
  const restos = await svc('GET', `suppliers?select=id&or=(id.in.(${[agA.id, agB.id, ...creados].join(',')}),name.like.QA%20MCP%20*)`)
  check('limpieza verificada: 0 agencias/proveedores QA', restos.length === 0, `quedan ${restos.length}`)
}

console.log(`\n${fallos ? '✘' : '✔'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
