// Hard-test de la superficie de encuestas (m002) por HTTP con JWT real: el
// mismo camino de la app, RLS y PostgREST incluidos.
//
// Correr con:
//   node --env-file=.env.local supabase/tests/encuestas_rls.mjs
//
// Lo que se protege: `poll_votes` guarda el contacto (WhatsApp/correo) de los
// leads que la agencia compró con Meta Ads. Si otra agencia lo alcanza, se
// filtra la lista de prospectos entera.
//
// El harness SIEMBRA su propio dato con service role y VERIFICA que quedó
// sembrado antes de probar: un test que solo comprueba "no ve nada" contra una
// tabla vacía da verde sin haber probado nada. Al final borra lo que creó y
// verifica que no quedó rastro.
//
// Cuentas QA (`qa.m002.*@ketzal.local`) y contraseña en KETZAL_QA_PASS: ambas
// fuera de git. Si no existen, se recrean con supabase/tests/qa_m002_setup.md.
const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASS = process.env.KETZAL_QA_PASS
if (!U || !ANON || !PASS) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / KETZAL_QA_PASS en .env.local')
  process.exit(1)
}
if (!SK) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY: el harness necesita sembrar su propio dato.')
  process.exit(1)
}

const WANDERLUST = 'e9289a23-c174-45f7-8601-3c86be99fc40'
const POLL = '0000dead-0000-4000-8000-00000000cafe'
const CONTACTO = 'lead.qa.m002@ketzal.local'

const CUENTAS = [
  { etiqueta: 'admin de Border (otra agencia)', email: 'qa.m002.borderadmin@ketzal.local' },
  { etiqueta: 'agente no-admin de Wanderlust', email: 'qa.m002.wlagente@ketzal.local' },
  { etiqueta: 'viajero del marketplace', email: 'qa.m002.viajero@ketzal.local' },
]

const hdrs = (t, extra = {}) => ({
  apikey: ANON, Authorization: `Bearer ${t}`, 'Accept-Profile': 'ketzal', ...extra,
})
const svc = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Accept-Profile': 'ketzal',
  'Content-Profile': 'ketzal', ...extra,
})

async function login(email) {
  const r = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })).json()
  return r.access_token ?? null
}

const get = async (t, path) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: hdrs(t) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

let fallos = 0
const check = (cond, msg) => {
  console.log(`   ${cond ? '✔' : '✘ FALLA:'} ${msg}`)
  if (!cond) fallos++
}

// ── Siembra ────────────────────────────────────────────────────────────────
console.log('═══ SIEMBRA (service role) ═══')
{
  const dueno = await (await fetch(
    `${U}/rest/v1/profiles?select=id&supplier_id=eq.${WANDERLUST}&role=in.(admin,superadmin)&limit=1`,
    { headers: svc() },
  )).json()
  if (!dueno?.[0]?.id) { console.error('   No hay admin de Wanderlust; abortando.'); process.exit(1) }

  await fetch(`${U}/rest/v1/polls?id=eq.${POLL}`, { method: 'DELETE', headers: svc() })
  const p = await fetch(`${U}/rest/v1/polls`, {
    method: 'POST',
    headers: svc({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({
      id: POLL, supplier_id: WANDERLUST, question: 'QA m002 HTTP',
      options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
      month_from: '2030-01-01', month_to: '2030-06-01',
      status: 'open', created_by: dueno[0].id,
    }),
  })
  check(p.status === 201, `encuesta de Wanderlust sembrada (status ${p.status})`)

  // El voto entra por el camino real: el RPC anónimo.
  const v = await (await fetch(`${U}/rest/v1/rpc/submit_poll_vote`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({
      p_poll: POLL, p_option: 1, p_month: '2030-03-01',
      p_voter_hash: 'hash_qa_m002_http_000000000000',
      p_suggestion: 'sugerencia QA', p_contact: CONTACTO,
      p_meta: { ip: '10.0.0.9', utm_source: 'meta' },
    }),
  })).json()
  check(v?.ok === true, `voto anónimo creado por RPC (${JSON.stringify(v)})`)

  const sembrado = await (await fetch(
    `${U}/rest/v1/poll_votes?select=id,contact&poll_id=eq.${POLL}`, { headers: svc() },
  )).json()
  check(
    Array.isArray(sembrado) && sembrado.length === 1 && sembrado[0].contact === CONTACTO,
    'el lead con PII existe de verdad (si no, lo de abajo sería verde falso)',
  )
}

// ── Las posiciones que NO deben alcanzarlo ─────────────────────────────────
let saltadas = 0
for (const c of CUENTAS) {
  console.log(`\n═══ ${c.etiqueta} ═══`)
  const t = await login(c.email)
  if (!t) {
    console.log('   ⚠ SALTADA: la cuenta QA no existe en este proyecto')
    saltadas++
    continue
  }

  const polls = await get(t, `polls?select=id,question,supplier_id&id=eq.${POLL}`)
  const vio = Array.isArray(polls.body) ? polls.body.length : 0
  check(vio === 0, `no ve la encuesta de Wanderlust (vio ${vio})`)

  const votos = await get(t, `poll_votes?select=id,contact,meta&poll_id=eq.${POLL}`)
  const filas = Array.isArray(votos.body) ? votos.body : []
  check(filas.length === 0, `no ve el lead ni su contacto (vio ${filas.length})`)

  // Barrido sin filtro: por si la policy dejara pasar por otra ruta.
  const todos = await get(t, 'poll_votes?select=id,contact&limit=50')
  const n = Array.isArray(todos.body) ? todos.body.length : 0
  check(n === 0, `no ve NINGÚN voto en toda la tabla (vio ${n})`)

  // poll_votes es RPC-only-write para todos.
  const w = await fetch(`${U}/rest/v1/poll_votes`, {
    method: 'POST',
    headers: hdrs(t, { 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' }),
    body: JSON.stringify({
      poll_id: POLL, option_id: 1, preferred_month: '2030-01-01',
      voter_hash: 'hash_qa_m002_insert_directo_1',
    }),
  })
  check(w.status >= 400, `no puede insertar votos directo (status ${w.status})`)

  // Editar el voto ajeno (el vector de "cambio el contacto por el mío").
  const u = await fetch(`${U}/rest/v1/poll_votes?poll_id=eq.${POLL}`, {
    method: 'PATCH',
    headers: hdrs(t, { 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' }),
    body: JSON.stringify({ contact: 'pisado@qa.local' }),
  })
  check(u.status >= 400, `no puede editar votos (status ${u.status})`)

  // Crear encuesta a nombre de Wanderlust.
  const p = await fetch(`${U}/rest/v1/polls`, {
    method: 'POST',
    headers: hdrs(t, { 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' }),
    body: JSON.stringify({
      supplier_id: WANDERLUST, question: 'suplantación',
      options: [{ id: 1, label: 'x' }],
      month_from: '2030-01-01', month_to: '2030-02-01',
    }),
  })
  check(p.status >= 400, `no puede crear encuestas de Wanderlust (status ${p.status})`)
}

// ── El dueño SÍ ve lo suyo (si no, la sección no sirve) ────────────────────
console.log('\n═══ control: la agencia dueña ═══')
{
  const sigue = await (await fetch(
    `${U}/rest/v1/poll_votes?select=id,contact&poll_id=eq.${POLL}`, { headers: svc() },
  )).json()
  check(
    Array.isArray(sigue) && sigue.length === 1 && sigue[0].contact === CONTACTO,
    'el lead sigue intacto tras todos los intentos de escritura',
  )
}

// ── Limpieza verificada ────────────────────────────────────────────────────
console.log('\n═══ LIMPIEZA ═══')
{
  await fetch(`${U}/rest/v1/polls?id=eq.${POLL}`, { method: 'DELETE', headers: svc() })
  const restos = await (await fetch(
    `${U}/rest/v1/poll_votes?select=id&voter_hash=like.hash_qa_m002*`, { headers: svc() },
  )).json()
  const n = Array.isArray(restos) ? restos.length : -1
  check(n === 0, `sin rastro del harness (quedaron ${n} filas)`)
}

console.log('\n─── RESUMEN ───')
if (saltadas === CUENTAS.length) {
  console.log('⚠ NO SE PROBÓ NINGUNA POSICIÓN: las cuentas QA no existen.')
  process.exit(2)
}
if (saltadas) console.log(`⚠ ${saltadas} cuenta(s) saltada(s)`)
console.log(fallos === 0 ? '🟢 sin fugas' : `🔴 ${fallos} falla(s)`)
process.exit(fallos === 0 ? 0 : 1)
