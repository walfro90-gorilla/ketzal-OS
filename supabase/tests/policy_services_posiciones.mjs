// Hard-test de `services_read` (b059) desde TODAS las posiciones, por HTTP con
// JWT real: el mismo camino de la app, RLS incluida.
//
// Correr con:
//   node --env-file=.env.local supabase/tests/policy_services_posiciones.mjs
//
// La policy viva:
//   published OR is_superadmin() OR supplier_id = my_supplier_id() OR is_free_agent()
// y `my_supplier_id()` sólo responde para `type='agente'`, así que un proveedor
// o un embajador con supplier_id NO alcanzan el catálogo interno de esa agencia.
// Eso es justo lo que b059 vino a cerrar: un proveedor con login al portal
// llevaba el supplier_id de la agencia y satisfacía 39 policies.
//
// Las cuentas son EFÍMERAS (`_fixtures.mjs`): se crean al arrancar y se borran
// en el `finally`. Las cifras del catálogo se DERIVAN con service role — estaban
// clavadas a "13 servicios, 2 publicados" y el catálogo ya cambió.
import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY

const svc = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Accept-Profile': 'ketzal', ...extra,
})
const hdrs = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Accept-Profile': 'ketzal' })

let fallos = 0
const check = (cond, msg) => { console.log(`   ${cond ? '✔' : '✘ FALLA:'} ${msg}`); if (!cond) fallos++ }

const servicios = async (t) =>
  (await fetch(`${U}/rest/v1/services?select=id,name,published,supplier_id`, { headers: hdrs(t) })).json()

// ── Referencia derivada del catálogo real ─────────────────────────────────
const todos = await (await fetch(
  `${U}/rest/v1/services?select=id,published,supplier_id`, { headers: svc() },
)).json()
if (!Array.isArray(todos)) {
  console.error('No se pudo leer el catálogo con service role; abortando.')
  process.exit(1)
}
const TOTAL = todos.length
const PUBLICADOS = todos.filter((s) => s.published === true).length

// La agencia con la que se prueba el caso "proveedor/embajador con supplier_id":
// la que más servicios internos tenga, que es donde una fuga se notaría.
const internos = todos.filter((s) => s.published !== true && s.supplier_id)
const porAgencia = new Map()
for (const s of internos) porAgencia.set(s.supplier_id, (porAgencia.get(s.supplier_id) ?? 0) + 1)
const [AGENCIA, INTERNOS_AGENCIA] = [...porAgencia.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
if (!AGENCIA) {
  console.error('No hay servicios internos con los que probar una fuga; abortando.')
  process.exit(1)
}
console.log(`Catálogo: ${TOTAL} servicios, ${PUBLICADOS} publicados, ${INTERNOS_AGENCIA} internos en la agencia de prueba`)

console.log('\n═══ POSICIONES EFÍMERAS ═══')
const qa = await crearPosiciones([
  { llave: 'libre', role: 'user', type: 'agente', supplier_id: null, name: 'QA agente libre' },
  { llave: 'embajador', role: 'user', type: 'embajador', supplier_id: AGENCIA, name: 'QA embajador' },
  { llave: 'proveedor', role: 'user', type: 'proveedor', supplier_id: AGENCIA, name: 'QA proveedor' },
  { llave: 'agenteagencia', role: 'user', type: 'agente', supplier_id: AGENCIA, name: 'QA agente de agencia' },
])

try {
  console.log('\n═══ ANÓNIMO (vitrina) ═══')
  {
    const r = await (await fetch(`${U}/rest/v1/services?select=id,published`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Profile': 'ketzal' },
    })).json()
    const n = Array.isArray(r) ? r.length : -1
    check(n === PUBLICADOS, `ve ${n} servicios (esperado ${PUBLICADOS}: sólo publicados)`)
    check(Array.isArray(r) && r.every((s) => s.published === true), 'todos los que ve están publicados')

    // El RPC público es SECURITY DEFINER: no depende de la policy y debe seguir sirviendo.
    const pub = await (await fetch(`${U}/rest/v1/rpc/list_public_services`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
      body: '{}',
    })).json()
    check(Array.isArray(pub) && pub.length === PUBLICADOS,
      `list_public_services devuelve ${Array.isArray(pub) ? pub.length : pub} (vitrina intacta)`)
  }

  // El agente libre vende todo el catálogo: es la excepción explícita de la policy.
  console.log('\n═══ AGENTE LIBRE ═══')
  {
    const s = await servicios(qa.libre.token)
    check(Array.isArray(s) && s.length === TOTAL, `ve ${s?.length} de ${TOTAL} (vende todo el catálogo)`)
  }

  // El agente de la agencia ve lo suyo + lo publicado, y NADA interno ajeno.
  console.log('\n═══ AGENTE DE LA AGENCIA ═══')
  {
    const s = await servicios(qa.agenteagencia.token)
    if (!Array.isArray(s)) { check(false, `respuesta no es lista: ${JSON.stringify(s).slice(0, 120)}`) }
    else {
      const noPub = s.filter((x) => x.published !== true)
      check(noPub.length === INTERNOS_AGENCIA, `ve los ${INTERNOS_AGENCIA} internos de su agencia (vio ${noPub.length})`)
      check(noPub.every((x) => x.supplier_id === AGENCIA), 'ningún interno ajeno')
    }
  }

  // Embajador y proveedor llevan supplier_id pero NO son staff: `my_supplier_id()`
  // les devuelve NULL, así que el catálogo interno no los alcanza. Esto es b059.
  for (const llave of ['embajador', 'proveedor']) {
    console.log(`\n═══ ${llave.toUpperCase()} (con supplier_id de la agencia) ═══`)
    const s = await servicios(qa[llave].token)
    if (!Array.isArray(s)) { check(false, `respuesta no es lista: ${JSON.stringify(s).slice(0, 120)}`); continue }
    const noPub = s.filter((x) => x.published !== true)
    check(noPub.length === 0, `NO ve ningún servicio interno (vio ${noPub.length})`)
    check(s.length === PUBLICADOS, `ve ${s.length} (esperado ${PUBLICADOS}: sólo publicados)`)
  }
} finally {
  if (!(await qa.destruir())) fallos++
}

console.log(`\n${fallos === 0 ? '✅ TODAS LAS POSICIONES CORRECTAS' : `❌ ${fallos} FALLAS`}`)
process.exit(fallos === 0 ? 0 : 1)
