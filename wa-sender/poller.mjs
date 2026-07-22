// poller.mjs — envía los recordatorios pendientes de Ketzal por WhatsApp.
//
// Espejo del wa-auto-outreach.js de gorilla-labs-openclaw, apuntado al outbox de
// Ketzal (ketzal.clawbot_reminders). Corre en la box (junto al bridge) como cron
// PM2. Reusa la doctrina anti-ban del founder:
//   - Gate app_settings.wa_auto_enabled (default false) — prender sin redeploy.
//   - Ventana hábil MX (9-18, L-V; --force para saltarla en pruebas).
//   - Cap diario app_settings.wa_daily_cap (cuenta enviados 24h).
//   - Blocklist ketzal.wa_optout (opt-out STOP/BAJA).
//   - Claim atómico (clawbot_claim_pendientes, FOR UPDATE SKIP LOCKED) → sin doble envío.
//   - Jitter humano 60-180s entre envíos.
// La dedupe dura ya la hace el outbox (dedupe_key en clawbot_generar_recordatorios).
//
//   node poller.mjs              # envía (respeta gate + cap + horario)
//   node poller.mjs --dry-run    # lista pendientes que mandaría, sin claim ni envío
//   node poller.mjs --force      # ignora la ventana horaria (pruebas)
//   node poller.mjs --test-phone 6561234567  # manda TODO a ese número (pruebas)

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'ketzal' },
  auth: { persistSession: false },
})
const BRIDGE = (process.env.KETZAL_WA_URL || 'http://127.0.0.1:3101').replace(/\/$/, '')
const TOKEN = process.env.KETZAL_WA_TOKEN || ''
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const TEST_PHONE = (() => {
  const i = process.argv.indexOf('--test-phone')
  return i >= 0 ? process.argv[i + 1] : null
})()

const log = (...a) => console.log(`[WApoller ${new Date().toISOString()}]`, ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── phone helpers (espejo de openclaw/wa-auto-outreach.js) ──
const DEFAULT_DIAL = '52'
const localDigits = (r) => String(r ?? '').replace(/\D/g, '').slice(-10)
function detectDial(r) {
  const d = String(r ?? '').replace(/\D/g, '')
  const p = d.slice(0, -10)
  if (!p) return DEFAULT_DIAL
  if (p === '52' || p === '521') return '52'
  if (p === '1') return '1'
  return DEFAULT_DIAL
}
function toE164(r) {
  const local = localDigits(r)
  if (local.length < 10) return null
  return `+${detectDial(r)}${local}`
}

// ── ventana hábil MX ──
function mxNow() {
  const now = new Date()
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false }))
  const wd = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' })
  return { hour, wd }
}
const withinBusinessHours = () => {
  const { hour, wd } = mxNow()
  return !['Sat', 'Sun'].includes(wd) && hour >= 9 && hour < 18
}

async function bridgeSend(phone, message) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const r = await fetch(`${BRIDGE}/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ phone, message }),
      signal: ctrl.signal,
    })
    const j = await r.json().catch(() => ({}))
    return { status: r.status, body: j }
  } finally {
    clearTimeout(timer)
  }
}

const mark = (id, status) => supabase.rpc('clawbot_marcar_bot', { p_id: id, p_status: status })

async function main() {
  if (!TOKEN && !DRY_RUN) return log('❌ KETZAL_WA_TOKEN vacío.')

  // Config (gate + cap) de la fila única app_settings.
  const { data: cfg, error: cfgErr } = await supabase.from('app_settings').select('wa_auto_enabled, wa_daily_cap').eq('id', 1).single()
  if (cfgErr) return log(`❌ app_settings: ${cfgErr.message}`)

  if (!DRY_RUN && cfg?.wa_auto_enabled !== true) {
    return log('⏸️  wa_auto_enabled=false → no envío. (Prende en app_settings).')
  }
  if (!withinBusinessHours() && !DRY_RUN && !FORCE) {
    const { hour, wd } = mxNow()
    return log(`🌙 Fuera de horario hábil MX (${wd} ${hour}h). No envío. (--force para pruebas).`)
  }

  // Cap 24h (cuenta enviados).
  const cap = typeof cfg?.wa_daily_cap === 'number' ? cfg.wa_daily_cap : 30
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: sent24h } = await supabase.from('clawbot_reminders').select('id', { count: 'exact', head: true }).eq('status', 'enviado').gte('sent_at', since)
  const remaining = Math.max(0, cap - (sent24h ?? 0))
  log(`Cap ${cap}/24h · enviados=${sent24h ?? 0} · disponibles=${remaining}${DRY_RUN ? ' · DRY-RUN' : ''}`)
  if (remaining === 0 && !DRY_RUN) return log('Cap alcanzado.')

  // Blocklist (opt-out), a 10 dígitos.
  const { data: blocks } = await supabase.from('wa_optout').select('phone')
  const blocked = new Set((blocks ?? []).map((b) => localDigits(b.phone)).filter(Boolean))

  // Recovery: 'enviando' colgado de una corrida previa que murió → de vuelta a pendiente.
  // (Cron single-instance: cualquier 'enviando' al arrancar es basura de un crash.)
  if (!DRY_RUN) {
    const { error: rErr } = await supabase.from('clawbot_reminders').update({ status: 'pendiente' }).eq('status', 'enviando')
    if (rErr) log(`⚠️  reset enviando: ${rErr.message}`)
  }

  // DRY-RUN: solo lee, no claim.
  if (DRY_RUN) {
    const { data: rows } = await supabase.from('clawbot_reminders').select('id, phone, kind, message').eq('status', 'pendiente').in('kind', ['abono_por_vencer', 'abono_vencido', 'viaje_proximo', 'cotizacion_seguimiento']).not('phone', 'is', null).order('created_at').limit(50)
    for (const r of rows ?? []) {
      const e164 = toE164(r.phone)
      const skip = !e164 ? 'phone_invalid' : blocked.has(localDigits(e164)) ? 'opt_out' : ''
      log(`  → [DRY] ${r.kind} · ${e164 || r.phone} ${skip ? `(SKIP ${skip})` : ''}`)
    }
    return log(`${(rows ?? []).length} pendientes (DRY-RUN).`)
  }

  // Claim atómico hasta 'remaining'.
  const { data: claimed, error: claimErr } = await supabase.rpc('clawbot_claim_pendientes', { p_limit: remaining })
  if (claimErr) return log(`❌ claim: ${claimErr.message}`)
  if (!claimed?.length) return log('Sin pendientes que enviar.')
  log(`${claimed.length} en claim.`)

  let sent = 0
  for (let i = 0; i < claimed.length; i++) {
    const r = claimed[i]
    const e164 = toE164(r.phone)
    if (!e164) {
      await mark(r.id, 'error')
      log(`⚠️  ${r.kind}: phone_invalid (${r.phone}) — error`)
      continue
    }
    if (blocked.has(localDigits(e164))) {
      await mark(r.id, 'descartado')
      log(`🚫 ${r.kind}: opt-out — descartado`)
      continue
    }

    const dest = TEST_PHONE || e164
    const res = await bridgeSend(dest, r.message)
    if (res.status === 503 || res.body?.status === 'session_dead') {
      await mark(r.id, 'pendiente') // bridge caído → reintentar luego
      log('🛑 bridge session_dead — devolviendo a pendiente y abortando.')
      break
    }
    if (res.status >= 200 && res.status < 300) {
      await mark(r.id, 'enviado')
      sent++
      log(`📤 ${r.kind} · ${dest}${TEST_PHONE ? ' (TEST)' : ''} · ok`)
    } else if (res.status === 422 || res.body?.status === 'phone_invalid') {
      await mark(r.id, 'error')
      log(`⚠️  ${r.kind}: phone_invalid — error`)
    } else {
      await mark(r.id, 'pendiente') // transitorio → reintento
      log(`❌ ${r.kind}: bridge ${res.status} — a pendiente`)
    }

    // Jitter humano entre envíos (no dormir tras el último).
    if (i < claimed.length - 1) await sleep(60000 + Math.floor(Math.random() * 120000))
  }
  log(`Listo: ${sent} enviados (cap disponible ${remaining}).`)
}

main().catch((e) => {
  log(`💥 ${e?.message ?? e}`)
  process.exit(1)
})
