// La agencia se configura en /ajustes (Configuración), no entrando a su propia
// fila en /proveedores.
//
// Por qué existe: el fundador reportó que la ÚNICA forma de editar su agencia
// (logo, nombre, cuenta de Mercado Pago) era abrir /proveedores y entrar a sí
// mismo — una sección que debe listar a los proveedores DE la agencia. Este
// harness fija las tres piezas del arreglo, con un admin de agencia efímero y
// un superadmin efímero, contra la app servida:
//   · /ajustes pinta "Mi agencia" con la ficha y la tarjeta de cobros MP;
//   · /proveedores NO lista la propia agencia (sí a sus proveedores); el
//     superadmin sí ve las agencias;
//   · /proveedores/<mi agencia> redirige a /ajustes conservando `?mp=`
//     (el callback del OAuth de MP sigue apuntando ahí).
// Status Y contenido, y las dos formas de pedir la página (URL directa y RSC),
// porque la pantalla de error de Next también responde 200 por el camino RSC.
//
//   pnpm build && pnpm start -p 3100
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/configuracion_agencia.mjs

import { crearPosiciones, crearEscenario, borrarEscenario } from './_fixtures.mjs'

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
/** La cookie que arma @supabase/ssr, partida en trozos como lo hace el navegador. */
function cookieDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return (trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)).join('; ')
}
async function pagina(path, cookie, rsc = false) {
  const r = await fetch(`${APP}${path}`, {
    headers: { cookie, ...(rsc ? { RSC: '1' } : {}) }, redirect: 'manual',
  })
  return { status: r.status, location: r.headers.get('location') ?? '', html: r.status === 200 ? await r.text() : '' }
}
// Solo los enlaces de la lista: el nombre de la agencia también sale en el
// shell (encabezado), así que buscarlo en todo el HTML da rojos/verdes falsos.
const enlaces = (html) => new Set([...html.matchAll(/\/proveedores\/([0-9a-f-]{36})/g)].map((m) => m[1]))

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Configuración de la agencia (/ajustes) vs. sus proveedores (/proveedores)\n')

const esc = await crearEscenario()
let proveedorId = null
let qa = null
try {
  const [ag] = await (await fetch(`${U}/rest/v1/suppliers?select=name&id=eq.${esc.supplierId}`, { headers: rest() })).json()
  const NOMBRE_PROV = `QA Transporte ${esc.supplierId.slice(0, 8)}`
  const creado = await fetch(`${U}/rest/v1/suppliers`, {
    method: 'POST', headers: rest({ Prefer: 'return=representation' }),
    body: JSON.stringify({ name: NOMBRE_PROV, contact_email: `qa.prov.${esc.supplierId.slice(0, 8)}@ketzal.local`,
      supplier_type: 'transporte', owner_supplier_id: esc.supplierId, commission_rate: 0 }),
  })
  proveedorId = (await creado.json())?.[0]?.id ?? null
  check('proveedor efímero de la agencia sembrado', Boolean(proveedorId), String(creado.status))

  qa = await crearPosiciones([
    { llave: 'adm', role: 'admin', type: 'agente', supplier_id: esc.supplierId, name: 'QA Admin Config' },
    { llave: 'god', role: 'superadmin', type: 'agente', name: 'QA God Config' },
  ])
  const adm = cookieDeSesion(qa.adm.sesion)
  const god = cookieDeSesion(qa.god.sesion)

  console.log('\n═══ Admin de agencia ═══')
  for (const [modo, rsc] of [['URL directa', false], ['clic desde el nav (RSC)', true]]) {
    const r = await pagina('/ajustes', adm, rsc)
    check(`/ajustes abre (${modo})`, r.status === 200, String(r.status))
    check(`/ajustes pinta "Mi agencia" con su nombre (${modo})`, r.html.includes('Mi agencia') && r.html.includes(ag.name))
    check(`/ajustes trae la tarjeta de cobros MP (${modo})`,
      r.html.includes('Cobros en l') && r.html.includes('Conectar mi Mercado Pago'))
    check(`/ajustes NO muestra la sección de plataforma al admin (${modo})`, !r.html.includes('Plataforma Ketzal'))
  }
  {
    const r = await pagina('/proveedores', adm)
    const ids = enlaces(r.html)
    check('/proveedores abre', r.status === 200, String(r.status))
    check('/proveedores lista al proveedor de la agencia', ids.has(proveedorId))
    check('/proveedores NO lista a la propia agencia', !ids.has(esc.supplierId))
    check('/proveedores enlaza a Configuración', /href="\/ajustes"/.test(r.html))
  }
  {
    const r = await pagina(`/proveedores/${esc.supplierId}`, adm)
    check('/proveedores/<mi agencia> redirige a /ajustes', [307, 308].includes(r.status) && /\/ajustes$/.test(r.location), `${r.status} ${r.location}`)
    const c = await pagina(`/proveedores/${esc.supplierId}?mp=conectado`, adm)
    check('…y conserva el ?mp= del callback de MP', [307, 308].includes(c.status) && /\/ajustes\?mp=conectado$/.test(c.location), `${c.status} ${c.location}`)
  }
  for (const [modo, rsc] of [['URL directa', false], ['clic desde la lista (RSC)', true]]) {
    const r = await pagina(`/proveedores/${proveedorId}`, adm, rsc)
    check(`/proveedores/<su proveedor> sí abre (${modo})`, r.status === 200 && r.html.includes(NOMBRE_PROV), String(r.status))
  }

  console.log('\n═══ Superadmin ═══')
  {
    const r = await pagina('/proveedores', god)
    check('el superadmin SÍ ve la agencia en /proveedores', enlaces(r.html).has(esc.supplierId))
    const d = await pagina(`/proveedores/${esc.supplierId}`, god)
    check('el superadmin abre la agencia sin redirect, con cobros MP', d.status === 200 && d.html.includes('Cobros en l'), String(d.status))
    const a = await pagina('/ajustes', god)
    check('/ajustes del superadmin sin agencia: plataforma sí, "Mi agencia" no',
      a.status === 200 && a.html.includes('Plataforma Ketzal') && !a.html.includes('Mi agencia'), String(a.status))
  }
} finally {
  console.log('\n═══ LIMPIEZA ═══')
  if (qa && !(await qa.destruir())) fallos++
  if (proveedorId) {
    const d = await fetch(`${U}/rest/v1/suppliers?id=eq.${proveedorId}`, { method: 'DELETE', headers: rest() })
    check('proveedor efímero borrado', d.status === 204, String(d.status))
  }
  await borrarEscenario(esc.supplierId)
  const quedan = await (await fetch(`${U}/rest/v1/suppliers?select=id&id=eq.${esc.supplierId}`, { headers: rest() })).json()
  check('agencia efímera borrada', Array.isArray(quedan) && quedan.length === 0)
}

console.log(`\n${fallos ? '❌' : '✅'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)
