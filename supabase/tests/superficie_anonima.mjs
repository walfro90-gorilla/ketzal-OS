// HARD TESTING — superficie anónima (caja negra).
//
// Se pone en los zapatos de cualquiera con la anon key, que NO es un secreto:
// va embebida en el bundle de JS de todas las páginas por diseño. La pregunta
// no es "¿puede conseguirla?" sino "¿qué alcanza con ella?".
//
// Uso: node supabase/tests/superficie_anonima.mjs

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Cliente ANÓNIMO puro: sin Authorization de usuario, sólo la apikey pública.
const anonGet = async (path) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Profile': 'ketzal' },
  })
  const t = await r.text()
  let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: r.status, body: b }
}
const anonRpc = async (fn, args) => {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: JSON.stringify(args),
  })
  const t = await r.text()
  let b; try { b = JSON.parse(t) } catch { b = t }
  return { status: r.status, body: b }
}

const hallazgos = []
const chequeo = (nombre, expuesto, detalle) => {
  hallazgos.push({ nombre, expuesto, detalle })
  console.log(`${expuesto ? '🔴 EXPUESTO' : '🟢 cerrado  '}  ${nombre}`)
  console.log(`             ${JSON.stringify(detalle).slice(0, 300)}`)
}

// ── 1. Tablas que el anon NO debería alcanzar ────────────────────────────
for (const t of ['bookings', 'payments', 'customers', 'receipts', 'profiles',
                 'payment_schedule', 'clawbot_reminders', 'system_log', 'payment_intents']) {
  const r = await anonGet(`${t}?select=*&limit=3`)
  const filas = Array.isArray(r.body) ? r.body.length : 0
  chequeo(`anon → ${t}`, filas > 0, { status: r.status, filas })
}

// ── 2. suppliers: la política es `qual = true` ───────────────────────────
// No es un catálogo público de fachadas: incluye a los proveedores operativos
// (hotel, transporte) con su correo, teléfono y la comisión pactada.
{
  const r = await anonGet('suppliers?select=id,name,supplier_type,contact_email,phone_number,address,commission_rate')
  const filas = Array.isArray(r.body) ? r.body : []
  chequeo('anon → suppliers (red de proveedores + comisiones)', filas.length > 0, {
    status: r.status, filas: filas.length,
    muestra: filas.slice(0, 3).map(s => ({
      name: s.name, tipo: s.supplier_type, email: s.contact_email,
      tel: s.phone_number, comision: s.commission_rate,
    })),
  })
}

// ── 3. services: sólo los publicados deberían verse sin sesión ───────────
{
  const r = await anonGet('services?select=id,name,price,published,supplier_id')
  const filas = Array.isArray(r.body) ? r.body : []
  const noPublicados = filas.filter(s => s.published === false)
  chequeo('anon → services no publicados', noPublicados.length > 0,
    { status: r.status, total_visibles: filas.length, no_publicados: noPublicados.length })
}

// ── 4. RPCs públicos con token inventado ────────────────────────────────
// Si un uuid al azar devuelve algo distinto de vacío, hay enumeración.
for (const [fn, arg] of [
  ['get_statement_by_token', { p_token: '11111111-2222-3333-4444-555555555555' }],
  ['get_quote_by_token',     { p_token: '11111111-2222-3333-4444-555555555555' }],
  ['get_receipt_public',     { p_receipt_id: '11111111-2222-3333-4444-555555555555' }],
  ['get_public_service',     { p_id: '11111111-2222-3333-4444-555555555555' }],
]) {
  const r = await anonRpc(fn, arg)
  const vacio = r.body === null || (Array.isArray(r.body) && r.body.length === 0)
  chequeo(`anon → ${fn}(uuid inventado)`, r.status === 200 && !vacio,
    { status: r.status, respuesta: r.body })
}

// ── 5. RPCs internos que el anon NO debería poder invocar ───────────────
for (const [fn, arg] of [
  ['dashboard_summary', {}],
  ['cobranza', {}],
  ['list_customers', {}],
  ['salud_sistema', {}],
  ['commissions_summary', {}],
  ['clawbot_bandeja', {}],
  ['reports_summary', { p_from: '2020-01-01', p_to: '2030-01-01' }],
  ['global_search', { p_q: 'a' }],
  // Superficie nueva de la migración 006: son SECURITY DEFINER, así que si el
  // grant quedara flojo servirían el directorio de agencias a cualquiera.
  ['list_agency_names', {}],
  ['agency_name', { p_id: '00000000-0000-4000-8000-00000000a001' }],
]) {
  const r = await anonRpc(fn, arg)
  const filas = Array.isArray(r.body) ? r.body.length : (r.body && typeof r.body === 'object' ? 1 : 0)
  chequeo(`anon → ${fn}()`, r.status === 200 && filas > 0,
    { status: r.status, muestra: JSON.stringify(r.body).slice(0, 160) })
}

console.log('\n─── RESUMEN ───')
const rojos = hallazgos.filter(h => h.expuesto)
console.log(`${hallazgos.length} pruebas · ${rojos.length} expuesta(s)`)
rojos.forEach(h => console.log(`  🔴 ${h.nombre}`))
