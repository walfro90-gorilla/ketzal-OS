// HARD TESTING — carreras de dinero (concurrencia real por HTTP).
//
// Por qué no está en SQL: un DO block tiene UNA sesión, así que un "test de
// concurrencia" ahí prueba secuencialidad y sale verde por construcción.
// Esto dispara N peticiones simultáneas contra PostgREST con un JWT real: el
// mismo camino de la app en producción, RLS y guards incluidos.
//
// Hermano de `concurrencia.mjs` (que cubre el cupo de una salida). Este cubre
// las cuatro carreras del dinero:
//   1. sobrepago      — N abonos a la vez sobre la misma venta
//   2. doble devolución — N refunds del mismo pago
//   3. doble canje    — N canjes del mismo crédito
//   4. folio de recibo — N recibos simultáneos, folios únicos
//
// Uso:
//   1) crear las fixtures (ver bloque SQL al final de este archivo)
//   2) node supabase/tests/carreras_dinero.mjs
//   3) limpiar (bloque SQL al final)
//
// Sesión: reusa la del MCP (`~/.config/ketzal/session.json`, sólo el refresh
// token) para no pedir contraseñas. Corre `npx ketzal-mcp login` si no existe.
//
// ══ RESULTADO DE REFERENCIA (2026-08-19, prod vacía) ══
//   1. 12 × $2,000 sobre venta de $10,000  → pasan 5, saldo 0        OK
//   2.  8 × refund del mismo pago          → pasa 1                  OK
//   3. 10 × $1,000 sobre crédito de $5,000 → pasan 5, canjeado 5000  OK
//   4.  5 recibos simultáneos              → folios 1..5 únicos      OK
//   ledger suma 0.00 · 0 grupos desbalanceados · 0 sobrepagos

import { crearPosiciones, crearEscenario, borrarEscenario, conPg } from './_fixtures.mjs'

// El entorno lo pone `node --env-file=.env.local` (lo hace `pnpm hard-test`).
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Escenario efímero. Antes esto eran UUID fijos que había que sembrar A MANO
// por execute_sql, y la sesión venía del refresh token que dejaba
// `npx ketzal-mcp login` — o sea, el harness solo corría si un humano se
// acordaba de dos pasos previos. Llevaba meses sin correr (ADR-0034). Y su
// bloque de limpieza (en comentario) era un `delete from ketzal.bookings` SIN
// WHERE: habría vaciado la base entera.
const escenario = await crearEscenario()
const qa = await crearPosiciones([
  { llave: 'admin', role: 'admin', type: 'agente', supplier_id: escenario.supplierId, name: 'QA Carreras Dinero' },
])
const token = qa.admin.token

const { B1, B2, B3, PAY, CRED } = await conPg(async (c) => {
  const ag = escenario.supplierId, u = qa.admin.id
  const cli = (await c.query(
    `insert into ketzal.customers(supplier_id, created_by, full_name)
     values ($1,$2,'RACE cliente') returning id`, [ag, u])).rows[0].id
  const bk = async (total) => (await c.query(
    `insert into ketzal.bookings(customer_id, selling_supplier_id, owner_supplier_id, sold_by,
       total, subtotal, discount, status, num_pax)
     values ($1,$2,$2,$3,$4,$4,0,'reserved',1) returning id`, [cli, ag, u, total])).rows[0].id
  const b1 = await bk(10000), b2 = await bk(10000), b3 = await bk(20000)
  const pay = (await c.query(
    `insert into ketzal.payments(booking_id, supplier_id, user_id, amount_mxn, status, type,
       payment_method, paid_at, installments, current_installment)
     values ($1,$2,$3,5000,'COMPLETED','payment','efectivo',now(),1,1) returning id`,
    [b2, ag, u])).rows[0].id
  const cred = (await c.query(
    `insert into ketzal.credits(supplier_id, customer_id, booking_origen_id, amount_mxn,
       expires_at, note, created_by)
     values ($1,$2,$3,5000,(current_date+365)::date,'RACE',$4) returning id`,
    [ag, cli, b1, u])).rows[0].id
  return { B1: b1, B2: b2, B3: b3, PAY: pay, CRED: cred }
})

async function rpc(fn, args) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'Content-Profile': 'ketzal',
    },
    body: JSON.stringify(args),
  })
  const t = await r.text()
  let body; try { body = JSON.parse(t) } catch { body = t }
  return { ok: r.ok, body }
}

const sel = async (path) => (await fetch(`${URL_BASE}/rest/v1/${path}`, {
  headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Accept-Profile': 'ketzal' },
})).json()

const resumen = (rs) => {
  const motivos = {}
  for (const x of rs) if (!x.ok) {
    const m = String(x.body?.message ?? x.body).slice(0, 60)
    motivos[m] = (motivos[m] ?? 0) + 1
  }
  return { ok: rs.filter((x) => x.ok).length, fallidas: rs.filter((x) => !x.ok).length, motivos }
}
const par = (n) => Array.from({ length: n })

console.log('\n1. Sobrepago concurrente — 12 × $2,000 sobre venta de $10,000')
{
  const rs = await Promise.all(par(12).map(() => rpc('register_payment',
    { p_booking_id: B1, p_amount: 2000, p_method: 'efectivo', p_paid_at: new Date().toISOString(), p_type: 'payment' })))
  console.log('  ', JSON.stringify(resumen(rs)))
  const [b] = await sel(`bookings_with_balance?select=paid,balance&id=eq.${B1}`)
  console.log(`   pagado=${b.paid} saldo=${b.balance} → ${Number(b.balance) >= -0.005 ? 'OK' : '*** SOBREPAGO ***'}`)
}

console.log('\n2. Doble devolución concurrente — 8 × refund del mismo pago')
{
  const rs = await Promise.all(par(8).map(() => rpc('refund_payment', { p_payment_id: PAY })))
  console.log('  ', JSON.stringify(resumen(rs)))
  const refunds = await sel(`payments?select=id&refunds_payment_id=eq.${PAY}`)
  console.log(`   devoluciones=${refunds.length} → ${refunds.length === 1 ? 'OK' : '*** DUPLICADA ***'}`)
}

console.log('\n3. Doble canje concurrente — 10 × $1,000 sobre crédito de $5,000')
{
  const rs = await Promise.all(par(10).map(() => rpc('redeem_credit', { p_credit: CRED, p_booking: B3, p_amount: 1000 })))
  console.log('  ', JSON.stringify(resumen(rs)))
  const canjes = await sel(`payments?select=amount_mxn&credit_id=eq.${CRED}&status=eq.COMPLETED`)
  const total = canjes.reduce((a, x) => a + Number(x.amount_mxn), 0)
  console.log(`   canjeado=${total} de 5000 → ${total <= 5000.005 ? 'OK' : '*** SOBRE-CANJEADO ***'}`)
}

console.log('\n4. Folio de recibo concurrente')
{
  const pagos = await sel(`payments?select=id&booking_id=eq.${B1}&type=eq.payment&status=eq.COMPLETED`)
  const rs = await Promise.all(pagos.map((p) => rpc('emit_receipt', { p_payment_id: p.id })))
  console.log('  ', JSON.stringify(resumen(rs)))
  const folios = rs.filter((x) => x.ok).map((x) => x.body)
  console.log(`   folios=${JSON.stringify(folios)} → ${new Set(folios).size === folios.length ? 'OK' : '*** DUPLICADO ***'}`)
}

// ── Verificación de invariantes globales y limpieza ──────────────────────────
const inv = await conPg(async (c) => (await c.query(`
  select
    (select count(*) from (select group_id from ketzal.ledger_entries
       group by group_id having round(sum(amount_mxn),2) <> 0) g) grupos_desbalanceados,
    (select count(*) from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
      where b.status<>'cancelled' and bb.balance < -0.005) sobrepagos,
    (select count(*) from (select folio, supplier_id from ketzal.receipts
       group by folio, supplier_id having count(*) > 1) f) folios_duplicados`)).rows[0])

console.log('\n5. Invariantes globales')
console.log('  ', JSON.stringify(inv))
const invOk = Number(inv.grupos_desbalanceados) === 0 && Number(inv.sobrepagos) === 0
  && Number(inv.folios_duplicados) === 0

const limpio = await borrarEscenario(escenario.supplierId)
const limpioCuentas = await qa.destruir()

console.log(`\n${invOk ? '✔' : '✘'} invariantes ${invOk ? 'en verde' : 'ROTOS'}`)
process.exit(invOk && limpio && limpioCuentas ? 0 : 1)
