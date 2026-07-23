// bridge.mjs — micro-servicio HTTP loopback que envuelve Baileys para enviar
// WhatsApp del NÚMERO DEDICADO de Ketzal. Corre en la box bajo PM2, separado del
// ciclo de la app (Vercel no puede sostener el socket WA).
//
// Versión recortada del wa-bridge.js de gorilla-labs-openclaw (mismo patrón
// probado): Baileys sobre WebSocket (sin Chromium), auth persistida en disco,
// reconnect con backoff, human-delay anti-ban. SIN el acoplamiento de Gorilla
// (nada de wa_messages, sentinel, reply-matcher): el outbox de Ketzal
// (clawbot_reminders) es la fuente de verdad y la dedupe la hace el poller.
//
// Seguridad: bind 127.0.0.1 ONLY (loopback; UFW default-deny en el puerto).
// Bearer token KETZAL_WA_TOKEN con timingSafeEqual. El poller corre en la misma
// box → llega por loopback, no hace falta exponerlo.
//
// Endpoints: GET /health · GET /qr (bearer) · POST /send { phone, message } (bearer)

import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import QRCode from 'qrcode'
import { Boom } from '@hapi/boom'
import NodeCache from 'node-cache'
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} from '@whiskeysockets/baileys'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const PORT = parseInt(process.env.KETZAL_WA_PORT || '3101', 10)
const HOST = '127.0.0.1' // loopback ONLY
const TOKEN = process.env.KETZAL_WA_TOKEN || ''
const AUTH_DIR = process.env.KETZAL_WA_AUTH_DIR || '/opt/ketzal-wa-session/baileys-state'
const LOG_LEVEL = process.env.KETZAL_WA_LOG_LEVEL || 'warn'

// Supabase (service role) — SOLO para capturar el opt-out entrante (STOP/BAJA) en
// ketzal.wa_optout. Best-effort: si falta el service key, el bridge sigue
// enviando normal y solo omite la captura (no es ruta de dinero).
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supa =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'ketzal' }, auth: { persistSession: false } })
    : null
// Palabras de baja (el mensaje ENTERO, sin distinción de mayúsculas ni acentos).
const OPTOUT_RE = /^(stop|baja|alto|cancelar|unsubscribe|no\s*more)$/i

const RECONNECT_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000]
const log = (...a) => console.log(`[ketzal-wa ${new Date().toISOString()}]`, ...a)
const baileysLogger = pino({ level: LOG_LEVEL })

const state = {
  sock: null,
  session_state: 'STARTING', // STARTING | UNPAIRED | CONNECTED
  wa_number: null,
  last_qr_raw: null,
  reconnect_attempt: 0,
  msgRetryCounterCache: new NodeCache(),
}

// ── auth helpers ──
async function nukeAuthDir() {
  try {
    await fs.rm(AUTH_DIR, { recursive: true, force: true })
  } catch (e) {
    log(`nuke auth dir: ${e.message}`)
  }
}
const humanDelay = () => new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 4000))) // 3-7s
const phoneToJid = (phone) => `${String(phone).replace(/\D/g, '')}@s.whatsapp.net`
const jidToPhone = (jid) => (jid ? jid.split(':')[0].split('@')[0] : null)
const localDigits = (r) => String(r ?? '').replace(/\D/g, '').slice(-10) // 10 dígitos locales (como el poller)

// Captura de opt-out entrante: si el número dedicado recibe "STOP"/"BAJA" (mensaje
// completo), guarda el teléfono en ketzal.wa_optout a 10 dígitos — la MISMA
// normalización que usa el poller para su blocklist — y así deja de escribirle.
// Best-effort: sin service key (supa=null) es no-op; solo mensajes 1-a-1 (no
// grupos/status) y solo entrantes (fromMe se ignora).
async function handleInbound({ messages, type }) {
  if (type !== 'notify' || !supa) return
  for (const m of messages || []) {
    if (m.key?.fromMe) continue
    const jid = m.key?.remoteJid || ''
    if (!jid.endsWith('@s.whatsapp.net')) continue
    const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim()
    if (!OPTOUT_RE.test(text)) continue
    const phone = localDigits(jidToPhone(jid))
    if (phone.length !== 10) continue
    const { error } = await supa
      .from('wa_optout')
      .upsert({ phone, reason: `inbound: ${text.slice(0, 40)}` }, { onConflict: 'phone', ignoreDuplicates: true })
    if (error) log(`opt-out upsert (+${phone}): ${error.message}`)
    else log(`🚫 opt-out entrante · +${phone} · "${text.slice(0, 40)}"`)
  }
}

let reconnectTimer = null
function scheduleReconnect(ms) {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => startSocket().catch((e) => log(`reconnect: ${e.message}`)), ms)
}

async function startSocket() {
  if (state.sock) {
    try {
      state.sock.ev.removeAllListeners()
      state.sock.end(undefined)
    } catch {
      /* noop */
    }
    state.sock = null
  }

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: baileysLogger,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, baileysLogger),
    },
    msgRetryCounterCache: state.msgRetryCounterCache,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    getMessage: async () => undefined,
  })
  state.sock = sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messages.upsert', (ev) => handleInbound(ev).catch((e) => log(`inbound: ${e.message}`)))

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      state.session_state = 'UNPAIRED'
      state.last_qr_raw = qr
      log('📷 QR generado — escanéalo con el WhatsApp del número Ketzal (o GET /qr).')
      try {
        qrcode.generate(qr, { small: true })
      } catch {
        /* noop */
      }
    }
    if (connection === 'connecting') state.session_state = 'STARTING'
    if (connection === 'open') {
      state.session_state = 'CONNECTED'
      state.last_qr_raw = null
      state.reconnect_attempt = 0
      const meJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null
      state.wa_number = meJid ? jidToPhone(meJid) : null
      log(`✅ WA CONNECTED como +${state.wa_number}`)
    }
    if (connection === 'close') {
      const boomErr = lastDisconnect?.error
      const statusCode = boomErr instanceof Boom ? boomErr.output?.statusCode : boomErr?.output?.statusCode
      const reasonName = Object.keys(DisconnectReason).find((k) => DisconnectReason[k] === statusCode) || `unknown(${statusCode})`
      log(`🔻 Cerrado · status=${statusCode} (${reasonName})`)
      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
        state.session_state = 'UNPAIRED'
        log('💥 LOGGED OUT — borrando auth, requiere re-parear (QR). PM2 reinicia.')
        await nukeAuthDir()
        process.exit(1)
      } else if (statusCode === DisconnectReason.restartRequired) {
        scheduleReconnect(0)
      } else {
        const attempt = state.reconnect_attempt++
        const backoff = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]
        state.session_state = 'STARTING'
        log(`⏳ Reconnect #${attempt + 1} en ${backoff}ms`)
        scheduleReconnect(backoff)
      }
    }
  })
}

// ── HTTP ──
const app = express()
app.use(express.json({ limit: '256kb' }))

function requireBearer(req, res, next) {
  const h = req.headers.authorization || ''
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '')
  const exp = Buffer.from(TOKEN)
  if (!TOKEN || got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
    return res.status(401).json({ error: 'invalid_token' })
  }
  next()
}
function requireSessionReady(req, res, next) {
  if (state.session_state !== 'CONNECTED' || !state.sock) {
    return res.status(503).json({ status: 'session_dead', session_state: state.session_state })
  }
  next()
}

app.get('/health', (req, res) => {
  res.json({ ok: state.session_state === 'CONNECTED', session_state: state.session_state, wa_number: state.wa_number })
})

app.get('/qr', requireBearer, async (req, res) => {
  if (!state.last_qr_raw) return res.status(404).json({ error: 'no_qr', session_state: state.session_state })
  const dataUrl = await QRCode.toDataURL(state.last_qr_raw)
  res.json({ qr: dataUrl, session_state: state.session_state })
})

app.post('/send', requireBearer, requireSessionReady, async (req, res) => {
  try {
    const { phone, message } = req.body || {}
    if (!phone || !message) return res.status(400).json({ error: 'phone y message requeridos' })

    // onWhatsApp resuelve el JID canónico (maneja el quirk MX 521) y valida que
    // el número exista en WhatsApp — usamos ESE jid para garantizar entrega.
    const probe = await state.sock.onWhatsApp(phoneToJid(phone))
    const r = Array.isArray(probe) ? probe[0] : null
    if (!r?.exists) return res.status(422).json({ status: 'phone_invalid', phone })

    await humanDelay()
    const sent = await state.sock.sendMessage(r.jid, { text: message })
    const messageId = sent?.key?.id
    if (!messageId) return res.status(500).json({ status: 'send_failed', error: 'sin key.id' })

    log(`📤 → +${jidToPhone(r.jid)} · msg_id=${messageId}`)
    res.json({ status: 'sent', wa_message_id: messageId, to: jidToPhone(r.jid) })
  } catch (e) {
    log(`/send crash: ${e.message}`)
    res.status(500).json({ status: 'send_failed', error: e.message })
  }
})

app.listen(PORT, HOST, () => log(`🌉 ketzal-wa-bridge en http://${HOST}:${PORT}`))
startSocket().catch((e) => {
  log(`startSocket fatal: ${e.message}`)
  process.exit(1)
})
