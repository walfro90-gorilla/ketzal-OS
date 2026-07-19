// HARD TESTING — carreras (concurrencia real).
//
// Por qué no está en SQL: probar una carrera necesita DOS conexiones de verdad
// pegándole a la misma fila a la vez. Dentro de un DO block sólo hay una sesión,
// así que un "test de concurrencia" en SQL prueba secuencialidad y da verde por
// construcción. Aquí se dispara por HTTP contra PostgREST con un JWT real: el
// mismo camino que usa la app en producción, RLS incluida.
//
// Requisitos: `qa_setup.sql` corrido y los usuarios QA con contraseña.
// Uso: node supabase/tests/concurrencia.mjs
//
// Los datos que genera se quedan (regla del fundador: huella inborrable) y
// viven bajo las agencias QA, así que no tocan los números reales.

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PASS = 'QA-hard-testing-2026'
const SERVICIO_CON_CUPO = '00000000-0000-4000-8000-00000000a003'

async function login(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login falló: ${JSON.stringify(j)}`)
  return j.access_token
}

// El header Content-Profile es lo que apunta a `ketzal`; sin él PostgREST busca
// en public y todo devuelve 404. La app lo pone vía db:{schema:'ketzal'}.
async function rpc(token, fn, args) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'Content-Profile': 'ketzal',
    },
    body: JSON.stringify(args),
  })
  const txt = await r.text()
  let body; try { body = JSON.parse(txt) } catch { body = txt }
  return { ok: r.ok, status: r.status, body }
}

async function tabla(token, path) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Accept-Profile': 'ketzal' },
  })
  return r.json()
}

const nuevaVenta = (token, nombre, total, servicio = null, fecha = null, pax = 1) =>
  rpc(token, 'create_booking_with_items', {
    p_customer_id: null,
    p_new_customer: { full_name: nombre },
    p_service_id: servicio,
    p_travel_date: fecha,
    p_discount: 0,
    p_notes: 'concurrencia',
    p_items: [{ item_type: 'passenger', passenger_type: 'adult', qty: pax, unit_price: total / pax }],
    p_status: 'reserved',
  })

const resultados = []
const reportar = (caso, ok, detalle) => {
  resultados.push({ caso, veredicto: ok ? 'OK' : 'HUECO', ...detalle })
  console.log(`${ok ? '  OK  ' : ' HUECO'}  ${caso}`)
  console.log(`        ${JSON.stringify(detalle)}`)
}

const alfa = await login('qa-alfa@ketzal.test')

// ───────────────────────────────────────────────────────── CARRERA 1
// Dos emit_receipt simultáneos sobre el MISMO abono.
// emit_receipt se defiende con `if exists (...) then raise`, y `receipts` NO
// tiene índice único en payment_id ⇒ el check y el insert no son atómicos.
// En secuencial rebota; la pregunta es qué pasa cuando ambos leen antes de que
// cualquiera escriba. Dos recibos = dos folios quemados por el mismo dinero.
{
  const v = await nuevaVenta(alfa, 'QA Carrera Recibo', 3000)
  const booking = v.body
  await rpc(alfa, 'register_payment',
    { p_booking_id: booking, p_amount: 1000, p_method: 'efectivo', p_paid_at: new Date().toISOString(), p_type: 'payment' })
  const pagos = await tabla(alfa, `payments?booking_id=eq.${booking}&select=id`)
  const payment = pagos[0].id

  const N = 8
  const rs = await Promise.all(Array.from({ length: N }, () => rpc(alfa, 'emit_receipt', { p_payment_id: payment })))
  const emitidos = rs.filter(r => r.ok)
  const recibos = await tabla(alfa, `receipts?payment_id=eq.${payment}&select=id,folio`)

  reportar('carrera 1 — N emit_receipt sobre el mismo abono', recibos.length === 1, {
    intentos: N,
    respuestas_ok: emitidos.length,
    recibos_en_bd: recibos.length,
    folios: recibos.map(r => r.folio),
    payment,
  })
}

// ───────────────────────────────────────────────────────── CARRERA 2
// N abonos simultáneos que INDIVIDUALMENTE caben en el saldo pero JUNTOS se
// pasan. Es la carrera que el `FOR UPDATE` de la migración 003 debe cerrar:
// sin candado los N leen el mismo saldo, los N validan, y los N escriben.
{
  const v = await nuevaVenta(alfa, 'QA Carrera Sobrepago', 1000)
  const booking = v.body
  const N = 10   // 10 × 200 = 2000 sobre un total de 1000
  const rs = await Promise.all(Array.from({ length: N }, () => rpc(alfa, 'register_payment',
    { p_booking_id: booking, p_amount: 200, p_method: 'efectivo', p_paid_at: new Date().toISOString(), p_type: 'payment' })))
  const aceptados = rs.filter(r => r.ok).length
  const saldo = (await tabla(alfa, `bookings_with_balance?id=eq.${booking}&select=total,paid,balance`))[0]

  reportar('carrera 2 — N abonos simultáneos que juntos exceden el total',
    Number(saldo.balance) >= 0 && Number(saldo.paid) <= Number(saldo.total),
    { intentos: N, aceptados, ...saldo, booking })
}

// ───────────────────────────────────────────────────────── CARRERA 3
// Sobreventa: la salida tiene 5 lugares. Se lanzan 10 ventas de 1 pax a la vez.
// El trigger tg_booking_capacity resuelve el cupo dentro del propio UPDATE
// (`where seats_taken + num_pax <= max_capacity`), que es el patrón correcto —
// esto lo confirma o lo desmiente.
{
  // Salida NUEVA en cada corrida. Reusar una fija hace que la segunda corrida
  // encuentre el cupo ya agotado, acepte 0 ventas y reporte OK sin haber
  // probado nada — un test que se apaga solo y no avisa.
  const fecha = new Date(Date.now() + (400 + Math.floor(Math.random() * 3000)) * 864e5)
    .toISOString().slice(0, 10)
  const alta = await fetch(`${URL_BASE}/rest/v1/service_departures`, {
    method: 'POST',
    headers: {
      apikey: ANON, Authorization: `Bearer ${alfa}`,
      'Content-Type': 'application/json', 'Content-Profile': 'ketzal', Prefer: 'return=representation',
    },
    body: JSON.stringify({ service_id: SERVICIO_CON_CUPO, departs_on: fecha, max_capacity: 5, seats_taken: 0 }),
  })
  if (!alta.ok) throw new Error(`no se pudo crear la salida: ${alta.status} ${await alta.text()}`)

  const N = 10
  const rs = await Promise.all(Array.from({ length: N }, (_, i) =>
    nuevaVenta(alfa, `QA Cupo ${i}`, 1000, SERVICIO_CON_CUPO, fecha, 1)))
  const aceptadas = rs.filter(r => r.ok).length
  const salida = (await tabla(alfa,
    `service_departures?service_id=eq.${SERVICIO_CON_CUPO}&departs_on=eq.${fecha}&select=max_capacity,seats_taken`))[0]

  // Se exige que aceptara EXACTAMENTE el cupo: menos significaría que la salida
  // venía sucia y el test volvió a apagarse.
  reportar('carrera 3 — 10 ventas simultáneas sobre una salida de 5 lugares',
    aceptadas === salida.max_capacity && salida.seats_taken === salida.max_capacity,
    { intentos: N, ventas_aceptadas: aceptadas, ...salida, fecha })
}

console.log('\n─── RESUMEN ───')
const huecos = resultados.filter(r => r.veredicto === 'HUECO')
console.log(`${resultados.length} carreras · ${huecos.length} hueco(s)`)
if (huecos.length) console.log(JSON.stringify(huecos, null, 2))
