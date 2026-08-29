// Hard-test de la superficie de encuestas (m002) por HTTP con JWT real: el
// mismo camino de la app, RLS incluida.
//
// Correr con:
//   node --env-file=.env.local supabase/tests/encuestas_rls.mjs
//
// Lo que se protege aquí: `poll_votes` guarda el contacto (WhatsApp/correo) de
// los leads que compró la agencia con Meta Ads. Si otra agencia o un usuario de
// otra persona lo alcanza, se filtra la lista de prospectos entera.
//
// La contraseña de las cuentas QA vive en KETZAL_QA_PASS (.env.local, ignorado
// por git) y NUNCA se escribe aquí: este repo es público.
const U = 'https://uznqmmeqwbbjkotbxwsw.supabase.co'
const K = 'sb_publishable_10KmaCYioepqZxbdM2oIyA__hiHJNGj'
const PASS = process.env.KETZAL_QA_PASS
if (!PASS) {
  console.error('Falta KETZAL_QA_PASS. Corre: node --env-file=.env.local ' + process.argv[1])
  process.exit(1)
}

const WANDERLUST = 'e9289a23-c174-45f7-8601-3c86be99fc40'

const CUENTAS = [
  { etiqueta: 'agente libre', email: 'walfre.am+agentelibre@gmail.com' },
  { etiqueta: 'embajador', email: 'walfre.am+embajador@gmail.com' },
  { etiqueta: 'proveedor Wanderlust', email: 'walfre.am+proveedor@gmail.com' },
]

const hdrs = (t) => ({ apikey: K, Authorization: `Bearer ${t}`, 'Accept-Profile': 'ketzal' })

async function login(email) {
  const r = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: K, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })).json()
  return r.access_token ?? null
}

const get = async (t, path) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: hdrs(t) })
  const b = await r.json().catch(() => null)
  return { status: r.status, body: b }
}

let fallos = 0
const check = (cond, msg) => {
  console.log(`   ${cond ? '✔' : '✘ FALLA:'} ${msg}`)
  if (!cond) fallos++
}

let saltadas = 0
for (const c of CUENTAS) {
  console.log(`\n═══ ${c.etiqueta} ═══`)
  const t = await login(c.email)
  if (!t) {
    // Las cuentas QA se borraron en la limpieza para operación real
    // (2026-08-23). Se salta en vez de fingir verde: la cobertura equivalente
    // por SQL vive en encuestas_rls.sql (suplantación con set_config).
    console.log('   ⚠ SALTADA: la cuenta QA no existe en este proyecto')
    saltadas++
    continue
  }

  const polls = await get(t, 'polls?select=id,question,supplier_id')
  const ajenas = Array.isArray(polls.body)
    ? polls.body.filter((p) => p.supplier_id === WANDERLUST)
    : []
  check(ajenas.length === 0, `no ve encuestas de Wanderlust (vio ${ajenas.length})`)

  // La prueba que importa: el contacto de los leads.
  const votos = await get(t, 'poll_votes?select=id,contact,meta&limit=50')
  const filas = Array.isArray(votos.body) ? votos.body : []
  check(filas.length === 0, `no ve ningún voto ni su PII (vio ${filas.length})`)

  // Escritura directa: la tabla es RPC-only-write para todos.
  const w = await fetch(`${U}/rest/v1/poll_votes`, {
    method: 'POST',
    headers: { ...hdrs(t), 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({
      poll_id: '11111111-2222-3333-4444-555555555555',
      option_id: 1,
      preferred_month: '2030-01-01',
      voter_hash: 'hash_de_prueba_rls_encuestas_1',
    }),
  })
  check(w.status >= 400, `no puede insertar votos directo (status ${w.status})`)

  // Crear encuesta a nombre de otra agencia.
  const p = await fetch(`${U}/rest/v1/polls`, {
    method: 'POST',
    headers: { ...hdrs(t), 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({
      supplier_id: WANDERLUST,
      question: 'suplantación de agencia',
      options: [{ id: 1, label: 'x' }],
      month_from: '2030-01-01',
      month_to: '2030-02-01',
    }),
  })
  check(p.status >= 400, `no puede crear encuestas de Wanderlust (status ${p.status})`)
}

console.log('\n─── RESUMEN ───')
if (saltadas === CUENTAS.length) {
  console.log('⚠ NO SE PROBÓ NADA: ninguna cuenta QA existe. Corre encuestas_rls.sql.')
  process.exit(2)
}
console.log(fallos === 0 ? '🟢 sin fugas' : `🔴 ${fallos} falla(s)`)
process.exit(fallos === 0 ? 0 : 1)
