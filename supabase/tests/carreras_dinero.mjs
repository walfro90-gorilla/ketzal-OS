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

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Fixtures con UUID fijos (ver el SQL al final).
const B1 = '0ace0000-0000-4000-8000-0000000000b1'  // venta $10,000 sin pagos
const B3 = '0ace0000-0000-4000-8000-0000000000b3'  // venta $20,000 sin pagos
const PAY = '0ace0000-0000-4000-8000-0000000000fa' // pago de $5,000
const CRED = '0ace0000-0000-4000-8000-0000000000cd' // crédito de $5,000

// Access token a partir del refresh token que dejó `ketzal-mcp login`.
const sessionPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ketzal', 'session.json')
const { refresh_token } = JSON.parse(readFileSync(sessionPath, 'utf8'))
const grant = await (await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ refresh_token }),
})).json()
const token = grant.access_token
if (!token) throw new Error('Sin sesión. Corre: npx ketzal-mcp login')

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

console.log('\n5. Invariantes')
console.log('   `ledger_entries` es deny-all: el balance-0 se verifica por SQL')
console.log('   (ver el bloque de verificación al final de este archivo).')

/* ══════════════════ FIXTURES (correr antes, por execute_sql) ══════════════════
do $$
declare
  v_ag uuid := '<AGENCIA>'; v_u uuid := '<SUPERADMIN>'; v_persona uuid := '<PERFIL VIAJERO>';
begin
  perform set_config('request.jwt.claim.sub', v_u::text, true);
  insert into ketzal.customers(id, supplier_id, created_by, full_name, marketplace_customer_id)
  values ('0ace0000-0000-4000-8000-000000000001', v_ag, v_u, 'RACE cliente', v_persona);
  insert into ketzal.bookings(id, customer_id, selling_supplier_id, owner_supplier_id, sold_by,
    total, subtotal, discount, status, num_pax) values
  ('0ace0000-0000-4000-8000-0000000000b1','0ace0000-0000-4000-8000-000000000001',v_ag,v_ag,v_u,10000,10000,0,'reserved',1),
  ('0ace0000-0000-4000-8000-0000000000b2','0ace0000-0000-4000-8000-000000000001',v_ag,v_ag,v_u,10000,10000,0,'reserved',1),
  ('0ace0000-0000-4000-8000-0000000000b3','0ace0000-0000-4000-8000-000000000001',v_ag,v_ag,v_u,20000,20000,0,'reserved',1);
  insert into ketzal.payments(id, booking_id, supplier_id, user_id, amount_mxn, status, type,
    payment_method, paid_at, installments, current_installment)
  values ('0ace0000-0000-4000-8000-0000000000fa','0ace0000-0000-4000-8000-0000000000b2',
          v_ag, v_u, 5000, 'COMPLETED', 'payment', 'efectivo', now(), 1, 1);
  insert into ketzal.credits(id, supplier_id, customer_id, booking_origen_id, amount_mxn,
    expires_at, note, created_by)
  values ('0ace0000-0000-4000-8000-0000000000cd', v_ag, '0ace0000-0000-4000-8000-000000000001',
          '0ace0000-0000-4000-8000-0000000000b1', 5000, (current_date+365)::date, 'RACE', v_u);
end $$;

-- OJO: estas ventas se insertan a mano SIN líneas, así que `verificar_invariantes`
-- va a reportar `subtotal_vs_lineas` por cada una. Es correcto: el chequeador
-- caza filas hechas a mano. No confundirlo con un bug del sistema.

   ══════════════════ VERIFICACIÓN ══════════════════
select
  (select coalesce(sum(amount_mxn),0) from ketzal.ledger_entries) suma_global,
  (select count(*) from (select group_id from ketzal.ledger_entries
     group by group_id having round(sum(amount_mxn),2) <> 0) g) grupos_desbalanceados,
  (select count(*) from ketzal.bookings b join ketzal.bookings_with_balance bb on bb.id=b.id
    where b.status<>'cancelled' and bb.balance < -0.005) sobrepagos,
  (select count(*) from (select folio, supplier_id from ketzal.receipts
     group by folio, supplier_id having count(*) > 1) f) folios_duplicados;

   ══════════════════ LIMPIEZA ══════════════════
-- OJO con el ORDEN: payments.credit_id referencia credits ⇒ payments ANTES.
-- Y `system_log` tiene su propio no_mutar: no lo toques o hay que bajarlo también.
do $$
begin
  alter table ketzal.payments disable trigger no_mutar;
  alter table ketzal.receipts disable trigger no_mutar;
  alter table ketzal.receipt_counters disable trigger no_mutar;
  alter table ketzal.commission_lines disable trigger no_mutar;
  alter table ketzal.expenses disable trigger no_mutar;
  alter table ketzal.doc_counters disable trigger no_mutar;
  alter table ketzal.ledger_entries disable trigger ledger_no_mutar;
  delete from ketzal.ledger_entries; delete from ketzal.commission_lines;
  delete from ketzal.ratings; delete from ketzal.receipts;
  delete from ketzal.payment_intents; delete from ketzal.expenses;
  delete from ketzal.payments; delete from ketzal.credits;
  delete from ketzal.bookings; delete from ketzal.customers;
  delete from ketzal.notifications; delete from ketzal.clawbot_reminders;
  delete from ketzal.receipt_counters; delete from ketzal.doc_counters;
  alter table ketzal.payments enable trigger no_mutar;
  alter table ketzal.receipts enable trigger no_mutar;
  alter table ketzal.receipt_counters enable trigger no_mutar;
  alter table ketzal.commission_lines enable trigger no_mutar;
  alter table ketzal.expenses enable trigger no_mutar;
  alter table ketzal.doc_counters enable trigger no_mutar;
  alter table ketzal.ledger_entries enable trigger ledger_no_mutar;
end $$;
════════════════════════════════════════════════════════════════════════════ */
