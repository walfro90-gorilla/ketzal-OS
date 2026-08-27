// Hard-test de `services_read` acotada (b059) desde TODAS las posiciones,
// por HTTP con JWT real: el mismo camino de la app, RLS incluida.
//
// Correr con:
//   node --env-file=.env.local supabase/tests/policy_services_posiciones.mjs
//
// La contrasena de las cuentas QA vive en KETZAL_QA_PASS (.env.local, ignorado
// por git) y NUNCA se escribe aqui: este repo es publico, y la anterior quedo
// legible en el historial de GitHub desde el commit 3828e3d.
const U = 'https://uznqmmeqwbbjkotbxwsw.supabase.co'
const K = 'sb_publishable_10KmaCYioepqZxbdM2oIyA__hiHJNGj'
const PASS = process.env.KETZAL_QA_PASS
if (!PASS) {
  console.error('Falta KETZAL_QA_PASS. Corre: node --env-file=.env.local ' + process.argv[1])
  process.exit(1)
}

// esperado: 'todo' = 13 | 'propios+pub' = suyos + publicados ajenos | 'solo_pub' = 2
const CUENTAS = [
  { etiqueta: 'agente libre',        email: 'walfre.am+agentelibre@gmail.com', espera: 'todo' },
  { etiqueta: 'embajador',           email: 'walfre.am+embajador@gmail.com',   espera: 'solo_pub' },
  { etiqueta: 'proveedor Wanderlust',email: 'walfre.am+proveedor@gmail.com',   espera: 'propios+pub' },
]

const hdrs = (t) => ({ apikey: K, Authorization: `Bearer ${t}`, 'Accept-Profile': 'ketzal' })

async function login(email) {
  const r = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })).json()
  if (!r.access_token) throw new Error(`login ${email}: ${r.error_description ?? r.msg}`)
  return r.access_token
}
const servicios = async (t) =>
  (await fetch(`${U}/rest/v1/services?select=id,name,published,supplier_id`, { headers: hdrs(t) })).json()

let fallos = 0
const check = (cond, msg) => { console.log(`   ${cond ? '✔' : '✘ FALLA:'} ${msg}`); if (!cond) fallos++ }

// Referencia (service role la conoce; aquí se deriva de lo que ve el superadmin).
const TOTAL = 13, PUBLICADOS = 2, WANDERLUST = 'e9289a23-c174-45f7-8601-3c86be99fc40'

console.log('\n═══ ANÓNIMO (vitrina) ═══')
{
  const r = await (await fetch(`${U}/rest/v1/services?select=id,published`, {
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Accept-Profile': 'ketzal' },
  })).json()
  const n = Array.isArray(r) ? r.length : -1
  check(n === PUBLICADOS, `ve ${n} servicios (esperado ${PUBLICADOS}: sólo publicados)`)
  check(Array.isArray(r) && r.every((s) => s.published === true), 'todos los que ve están publicados')
  // El RPC público debe seguir sirviendo (es SECURITY DEFINER, no depende de la policy)
  const pub = await (await fetch(`${U}/rest/v1/rpc/list_public_services`, {
    method: 'POST', headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: '{}',
  })).json()
  check(Array.isArray(pub) && pub.length === PUBLICADOS, `list_public_services sigue devolviendo ${Array.isArray(pub) ? pub.length : pub} (vitrina intacta)`)
}

for (const c of CUENTAS) {
  console.log(`\n═══ ${c.etiqueta.toUpperCase()} ═══`)
  const t = await login(c.email)
  const s = await servicios(t)
  if (!Array.isArray(s)) { console.log('   ✘ FALLA: respuesta no es lista', JSON.stringify(s).slice(0, 120)); fallos++; continue }
  const noPublicados = s.filter((x) => x.published !== true)
  const ajenosNoPub = noPublicados.filter((x) => x.supplier_id !== WANDERLUST)

  if (c.espera === 'todo') {
    check(s.length === TOTAL, `ve ${s.length} de ${TOTAL} (agente libre vende todo el catálogo)`)
  } else if (c.espera === 'solo_pub') {
    check(s.length === PUBLICADOS, `ve ${s.length} (esperado ${PUBLICADOS}: sólo publicados)`)
    check(noPublicados.length === 0, 'NO ve ningún servicio interno')
  } else {
    check(noPublicados.every((x) => x.supplier_id === WANDERLUST),
      `los internos que ve son sólo de su proveedor (${noPublicados.length} internos, ${ajenosNoPub.length} ajenos)`)
    check(ajenosNoPub.length === 0, 'NO ve internos de otra agencia')
  }
}

console.log(`\n${fallos === 0 ? '✅ TODAS LAS POSICIONES CORRECTAS' : `❌ ${fallos} FALLAS`}`)
process.exit(fallos === 0 ? 0 : 1)
