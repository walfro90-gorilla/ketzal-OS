// Capturas REALES del producto para la home (KETZAL_HOME_REDESIGN.md §6.2, §10).
//
// Qué hace: siembra una agencia efímera con una venta, su plan de abonos y dos
// pagos; abre las pantallas del OS en Chrome headless (CDP, sin extensión) con
// la cookie de sesión de un agente efímero; guarda PNG a 2x en public/home/;
// y borra TODO verificando que quedó en cero. Ninguna cuenta ni dato real:
// nombres y montos son de demostración sobre la interfaz real.
//
// Cómo: (con el build servido)
//   pnpm build && pnpm start -p 3300 &
//   APP=http://localhost:3300 node --env-file=.env.local scripts/capturas-home.mjs
//
// Necesita DATABASE_URL (siembra/limpieza por pg como _fixtures) y Chrome.
// No es un hard-test: no va en correr.mjs. Escribe y borra, como crearEscenario.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { crearPosiciones, borrarEscenario } from '../supabase/tests/_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP = process.env.APP ?? 'http://localhost:3300'
// Fuera de public/: así solo salen por el optimizador de next/image (AVIF/WebP
// con tamaño), no como PNG crudo de 600 KB.
const OUT = new URL('../src/components/marketing/capturas/', import.meta.url).pathname
const CHROME = process.env.CHROME ?? 'google-chrome'
// Ficha pública real (Border Travels, publicada): no necesita sesión ni fixture.
const SERVICIO_PUBLICO = 'b32907ab-0fe2-4e0c-a74b-c315622317c7'

const hoy = new Date()
const dias = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d }
const iso = (d) => d.toISOString().slice(0, 10)

/** La cookie que arma @supabase/ssr, partida como lo hace el navegador. */
function cookiesDeSesion(sesion) {
  const ref = new URL(U).hostname.split('.')[0]
  const valor = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = valor.match(/.{1,3180}/g)
  return trozos.length === 1
    ? [{ name: `sb-${ref}-auth-token`, value: trozos[0] }]
    : trozos.map((t, i) => ({ name: `sb-${ref}-auth-token.${i}`, value: t }))
}

// ── Siembra ──────────────────────────────────────────────────────────────────
async function sembrar() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    const sup = await c.query(
      `insert into ketzal.suppliers(name, contact_email, supplier_type, commission_rate)
       values ('Wanderlust Travels (demo)', $1, 'agency', 0) returning id`,
      [`qa.escenario.${randomUUID().slice(0, 8)}@ketzal.local`])
    const supplierId = sup.rows[0].id
    const svc = await c.query(
      `insert into ketzal.services(supplier_id, name, price, published, city_to, state_to, description)
       values ($1, 'Huasteca Potosina en Avión', 7999, false, 'Ciudad Valles', 'San Luis Potosí',
               '4 días. Vuelo redondo, hotel, Tamul, Puente de Dios y Cascadas de Micos.') returning id`,
      [supplierId])
    const serviceId = svc.rows[0].id
    const salida = iso(dias(45))
    await c.query(
      `insert into ketzal.service_departures(service_id, departs_on, max_capacity, seats_taken)
       values ($1, $2, 16, 0)`, [serviceId, salida])
    return { c, supplierId, serviceId, salida }
  } catch (e) { await c.end(); throw e }
}

async function sembrarVenta(c, { supplierId, serviceId, salida, agenteId }) {
  const cli = await c.query(
    `insert into ketzal.customers(supplier_id, full_name, phone, created_by)
     values ($1, 'María González Ramírez', '6561234567', $2) returning id`, [supplierId, agenteId])
  const customerId = cli.rows[0].id
  const total = 7999 * 2
  const bk = await c.query(
    `insert into ketzal.bookings(folio, selling_supplier_id, owner_supplier_id, customer_id, service_id,
       sold_by, travel_date, num_pax, subtotal, discount, total, currency, status, channel, notes)
     values ($1, $2, $2, $3, $4, $5, $6, 2, $7, 0, $7, 'MXN', 'reserved', 'manual',
             'Pide asientos juntos. Confirmó por WhatsApp.') returning id`,
    ['V-000042', supplierId, customerId, serviceId, agenteId, salida, total])
  const bookingId = bk.rows[0].id
  await c.query(
    `insert into ketzal.booking_items(booking_id, item_type, passenger_type, description, qty, unit_price, line_total)
     values ($1, 'service', 'adulto', 'Huasteca Potosina en Avión · Adulto', 2, 7999, $2)`, [bookingId, total])
  return { bookingId, customerId }
}

/** Lo que sí pasa por la app: plan y abonos por RPC con el JWT del agente (RLS decide). */
async function rpc(token, fn, body) {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      'Content-Profile': 'ketzal', 'Accept-Profile': 'ketzal' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${txt.slice(0, 200)}`)
  return txt ? JSON.parse(txt) : null
}

async function rest(token, path) {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Accept-Profile': 'ketzal' },
  })
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`)
  return r.json()
}

// ── Chrome por CDP (sin dependencias: WebSocket global de Node ≥ 22) ─────────
function lanzarChrome() {
  return new Promise((resolve, reject) => {
    const p = spawn(CHROME, [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--hide-scrollbars', '--font-render-hinting=none',
      `--user-data-dir=/tmp/kz-capturas-${process.pid}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => {
      err += d
      const m = /ws:\/\/[^\s]+/.exec(err)
      if (m) resolve({ proceso: p, ws: m[0] })
    })
    p.on('exit', (code) => reject(new Error(`Chrome salió ${code}: ${err.slice(-300)}`)))
    setTimeout(() => reject(new Error('Chrome no expuso DevTools en 10 s')), 10_000)
  })
}

function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pendientes = new Map()
  const oyentes = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pendientes.has(m.id)) {
      const { ok, ko } = pendientes.get(m.id); pendientes.delete(m.id)
      if (m.error) ko(new Error(m.error.message)); else ok(m.result)
    } else if (m.method && oyentes.has(m.method)) {
      for (const f of oyentes.get(m.method)) f(m.params)
    }
  })
  const listo = new Promise((ok, ko) => { ws.addEventListener('open', ok); ws.addEventListener('error', ko) })
  return {
    listo,
    enviar: (method, params = {}, sessionId) => new Promise((ok, ko) => {
      const n = ++id
      pendientes.set(n, { ok, ko })
      ws.send(JSON.stringify({ id: n, method, params, sessionId }))
    }),
    en: (method, f) => { if (!oyentes.has(method)) oyentes.set(method, []); oyentes.get(method).push(f) },
    cerrar: () => ws.close(),
  }
}

// `desplazarA`: texto de un encabezado; se hace scroll hasta él y se captura
// SOLO el viewport (con su barra fija real), en vez de la página completa.
// `soloViewport`: captura el primer viewport tal cual (sin página completa).
// `formato`: 'png' (UI plana) o 'jpeg' (pantallas con foto: la vitrina en PNG
// pesa 2 MB y el optimizador la re-codifica igual).
async function capturar(cdp, { ruta, archivo, ancho, alto, movil, cookies, altoMax = 2400, desplazarA = null, soloViewport = false, formato = 'png' }) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => cdp.enviar(m, p, sessionId)
  await s('Page.enable'); await s('Network.enable'); await s('Runtime.enable')
  for (const ck of cookies ?? []) {
    await s('Network.setCookie', { ...ck, domain: 'localhost', path: '/', httpOnly: false, secure: false })
  }
  // Sin modal "instala la app" (mide max-width: 767px) ni tema del sistema oscuro.
  await s('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('kz_instalar_lista','1')}catch{}`,
  })
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await s('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: !!movil })
  const cargada = new Promise((ok) => cdp.en('Page.loadEventFired', (p) => ok(p)))
  await s('Page.navigate', { url: `${APP}${ruta}` })
  await cargada
  // Streaming + hidratación + fuentes: darles aire antes de disparar.
  await new Promise((r) => setTimeout(r, 2500))
  let altoReal = alto
  if (desplazarA) {
    await s('Runtime.evaluate', { expression: `
      (() => { const e = [...document.querySelectorAll('h1,h2,h3,[data-slot=card-title]')]
        .find((n) => n.textContent.trim().startsWith(${JSON.stringify(desplazarA)}));
        if (!e) throw new Error('no hay encabezado ' + ${JSON.stringify(desplazarA)});
        (e.closest('[data-slot=card]') ?? e).scrollIntoView({ block: 'start' });
        // El header es sticky: sin este margen tapa el título de la card.
        const h = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
        window.scrollBy(0, -(h + 12)); })()`, awaitPromise: true })
    await new Promise((r) => setTimeout(r, 500))
  } else if (!soloViewport) {
    const { cssContentSize } = await s('Page.getLayoutMetrics')
    altoReal = Math.min(Math.ceil(cssContentSize.height), altoMax)
    await s('Emulation.setDeviceMetricsOverride', { width: ancho, height: Math.max(alto, altoReal), deviceScaleFactor: 2, mobile: !!movil })
    await new Promise((r) => setTimeout(r, 400))
  }
  const { data } = await s('Page.captureScreenshot', {
    format: formato, ...(formato === 'jpeg' ? { quality: 88 } : {}), captureBeyondViewport: !desplazarA && !soloViewport,
  })
  writeFileSync(`${OUT}${archivo}`, Buffer.from(data, 'base64'))
  const titulo = (await s('Runtime.evaluate', { expression: 'document.title + " | " + location.pathname', returnByValue: true })).result.value
  console.log(`   ✔ ${archivo}  ${ancho}×${altoReal}@2x  ← ${titulo}`)
  await cdp.enviar('Target.closeTarget', { targetId })
}

// ── Main ─────────────────────────────────────────────────────────────────────
let semilla, posiciones, chrome
try {
  mkdirSync(OUT, { recursive: true })
  semilla = await sembrar()
  console.log(`   ✔ agencia efímera ${semilla.supplierId.slice(0, 8)} con servicio y salida ${semilla.salida}`)

  posiciones = await crearPosiciones([
    { llave: 'agente', role: 'admin', type: 'agente', supplier_id: semilla.supplierId, name: 'Walfre Aguilar' },
  ])
  const ag = posiciones.agente
  // Sin tour de bienvenida encima de las pantallas.
  await fetch(`${U}/rest/v1/profiles?id=eq.${ag.id}`, {
    method: 'PATCH',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', 'Content-Profile': 'ketzal' },
    body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
  })

  const venta = await sembrarVenta(semilla.c, { ...semilla, agenteId: ag.id })
  await rpc(ag.token, 'generate_payment_plan', {
    p_booking_id: venta.bookingId, p_frequency: 'quincenal', p_final_date: iso(dias(35)), p_down_pct: 0.3,
  })
  await rpc(ag.token, 'register_payment', {
    p_booking_id: venta.bookingId, p_amount: 4800, p_method: 'Efectivo',
    p_paid_at: dias(-20).toISOString(), p_type: 'payment',
  })
  await rpc(ag.token, 'register_payment', {
    p_booking_id: venta.bookingId, p_amount: 2800, p_method: 'Transferencia',
    p_paid_at: dias(-5).toISOString(), p_type: 'payment',
  })
  // Política congelada y aceptada (ADR-0010): sin esto la ficha muestra el aviso
  // ámbar de "sin aceptación registrada", que es un estado legado, no el normal.
  await rpc(ag.token, 'snapshot_booking_policy', { p_booking: venta.bookingId }).catch((e) => console.log(`   ⚠ política: ${e.message}`))
  await semilla.c.query(
    `update ketzal.bookings set policy_accepted_at = now(), policy_accepted_meta = '{"canal":"whatsapp"}' where id = $1`,
    [venta.bookingId])
  const pagos = await rest(ag.token, `payments?booking_id=eq.${venta.bookingId}&select=id&order=paid_at.asc`)
  for (const p of pagos) await rpc(ag.token, 'emit_receipt', { p_payment_id: p.id }).catch((e) => console.log(`   ⚠ recibo: ${e.message}`))
  console.log(`   ✔ venta ${venta.bookingId.slice(0, 8)}: plan quincenal, 2 abonos, ${pagos.length} recibos`)

  chrome = await lanzarChrome()
  const cdp = conectar(chrome.ws)
  await cdp.listo
  const cookies = cookiesDeSesion(ag.sesion)
  const movil = { ancho: 390, alto: 844, movil: true, cookies }
  const escritorio = { ancho: 1440, alto: 900, movil: false, cookies }
  const V = `/ventas/${venta.bookingId}`
  await capturar(cdp, { ...movil, ruta: V, archivo: 'venta-movil.png', altoMax: 1800 })
  await capturar(cdp, { ...movil, ruta: V, archivo: 'venta-movil-plan.png', desplazarA: 'Plan de pagos' })
  // La del hero: más corta (390×720) para que quepa junto al H1 en escritorio.
  await capturar(cdp, { ...movil, alto: 720, ruta: V, archivo: 'venta-movil-hero.png', desplazarA: 'Plan de pagos' })
  await capturar(cdp, { ...movil, ruta: V, archivo: 'venta-movil-abonos.png', desplazarA: 'Abonos y recibo' })
  await capturar(cdp, { ...escritorio, ruta: V, archivo: 'venta-escritorio.png', altoMax: 1400 })
  // Etapa 3 (features): tres pantallas de escritorio a 1280×800, mismo encuadre.
  const panel = { ancho: 1280, alto: 800, movil: false, cookies, soloViewport: true }
  await capturar(cdp, { ...panel, ruta: V, archivo: 'venta-escritorio-plan.png', desplazarA: 'Plan de pagos' })
  await capturar(cdp, { ...panel, ruta: '/cobranza', archivo: 'cobranza-panel.png' })
  await capturar(cdp, { ...panel, cookies: [], ruta: `/servicio/${SERVICIO_PUBLICO}`, archivo: 'vitrina-panel.jpg', formato: 'jpeg' })
  await capturar(cdp, { ...movil, ruta: '/cobranza', archivo: 'cobranza-movil.png' })
  await capturar(cdp, { ...escritorio, ruta: '/cobranza', archivo: 'cobranza-escritorio.png' })
  await capturar(cdp, { ...escritorio, ruta: '/dashboard', archivo: 'dashboard-escritorio.png' })
  await capturar(cdp, { ...movil, ruta: '/ventas', archivo: 'ventas-movil.png' })
  await capturar(cdp, { ...movil, cookies: [], ruta: `/servicio/${SERVICIO_PUBLICO}`, archivo: 'vitrina-movil.png' })
  cdp.cerrar()
} finally {
  if (chrome) chrome.proceso.kill()
  // Limpieza en orden: primero lo que cuelga de la agencia (dinero incluido), luego las cuentas.
  let limpio = true
  if (semilla) {
    // Los contadores de folio (venta/recibo) no tienen FK a suppliers: no
    // bloquean el borrado, pero quedarían huérfanos. Fuera antes de la agencia.
    for (const t of ['doc_counters', 'receipt_counters']) {
      await semilla.c.query(`delete from ketzal.${t} where supplier_id = $1`, [semilla.supplierId]).catch(() => {})
    }
    try { await semilla.c.end() } catch {}
    try { await borrarEscenario(semilla.supplierId) } catch (e) { limpio = false; console.error(`   ✘ escenario: ${e.message}`) }
  }
  if (posiciones) limpio = (await posiciones.destruir()) && limpio
  console.log(limpio ? '   ✔ limpieza verificada' : '   ✘ QUEDARON RESTOS — limpiar a mano')
  process.exitCode = limpio ? 0 : 1
}
