/**
 * Sesión contra Supabase Auth (GoTrue).
 *
 * Tesis de seguridad: el servidor se autentica como **usuario real** y opera con
 * su JWT. La RLS por agencia y los guards de los RPCs deciden qué ve y qué puede
 * hacer. Nunca hay service role key aquí.
 *
 * Del disco solo sale el `refresh_token`, en un archivo 0600. La contraseña no se
 * guarda jamás, y el config del cliente MCP queda sin secretos.
 */
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SUPABASE_KEY, SUPABASE_URL } from './config.js'
import { log } from './log.js'

type Stored = { email: string; refresh_token: string }
type Grant = { access_token: string; refresh_token: string; expires_in: number }

export function sessionPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'ketzal', 'session.json')
}

async function gotrue(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    const msg = (j.error_description ?? j.msg ?? j.error ?? `HTTP ${r.status}`) as string
    throw new Error(String(msg))
  }
  return j
}

function asGrant(j: Record<string, unknown>): Grant {
  const access = j.access_token
  const refresh = j.refresh_token
  if (typeof access !== 'string' || typeof refresh !== 'string') {
    throw new Error('Supabase no devolvió tokens. ¿El correo está registrado en Ketzal?')
  }
  return { access_token: access, refresh_token: refresh, expires_in: Number(j.expires_in ?? 3600) }
}

// ── disco ────────────────────────────────────────────────────────────────────

export async function readStored(): Promise<Stored | null> {
  try {
    const raw = await readFile(sessionPath(), 'utf8')
    const j = JSON.parse(raw) as Partial<Stored>
    if (typeof j.email === 'string' && typeof j.refresh_token === 'string') {
      return { email: j.email, refresh_token: j.refresh_token }
    }
    return null
  } catch {
    return null
  }
}

async function writeStored(s: Stored): Promise<void> {
  const p = sessionPath()
  await mkdir(dirname(p), { recursive: true, mode: 0o700 })
  await writeFile(p, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 })
  // `mode` de writeFile no aplica si el archivo ya existía: lo forzamos aparte.
  await chmod(p, 0o600)
}

export async function clearSession(): Promise<void> {
  await rm(sessionPath(), { force: true })
  cached = null
}

// ── login ────────────────────────────────────────────────────────────────────

/** Manda el código de 6 dígitos. `create_user:false`: en Ketzal se entra por invitación. */
export async function sendOtp(email: string): Promise<void> {
  await gotrue('otp', { email, create_user: false })
}

/** Canjea el código y persiste la sesión. */
export async function verifyOtp(email: string, token: string): Promise<void> {
  const g = asGrant(await gotrue('verify', { email, token, type: 'email' }))
  await writeStored({ email, refresh_token: g.refresh_token })
  cached = { token: g.access_token, expiresAt: Date.now() + g.expires_in * 1000 }
}

/**
 * Canjea la **liga** del correo en vez de un código.
 *
 * La plantilla de correo de Supabase es la de Magic Link: trae una liga, no un
 * código de 6 dígitos (para eso la plantilla tendría que incluir `{{ .Token }}`).
 * La liga lleva el `token_hash` en la query, y GoTrue lo canjea por POST sin
 * pasar por el navegador — así no hace falta tocar la configuración de auth de
 * producción, que es compartida con la app.
 *
 * Copia la DIRECCIÓN de la liga, no le des clic: al abrirla se consume.
 */
export async function verifyMagicLink(link: string): Promise<void> {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    throw new Error('Eso no es una liga válida. Copia la dirección del botón "Log In" del correo.')
  }
  const hash = url.searchParams.get('token_hash') ?? url.searchParams.get('token')
  if (!hash) throw new Error('La liga no trae token. ¿Copiaste la dirección completa?')
  const type = url.searchParams.get('type') || 'magiclink'

  const g = asGrant(await gotrue('verify', { type, token_hash: hash }))
  const email = await emailDelToken(g.access_token)
  await writeStored({ email, refresh_token: g.refresh_token })
  cached = { token: g.access_token, expiresAt: Date.now() + g.expires_in * 1000 }
}

/** El correo dueño de un access token recién emitido (la liga no lo trae). */
async function emailDelToken(token: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  })
  const j = (await r.json().catch(() => ({}))) as { email?: string }
  return j.email ?? 'desconocido'
}

/** Login por contraseña. Solo para el fallback headless por env. */
export async function loginWithPassword(email: string, password: string): Promise<void> {
  const g = asGrant(await gotrue('token?grant_type=password', { email, password }))
  await writeStored({ email, refresh_token: g.refresh_token })
  cached = { token: g.access_token, expiresAt: Date.now() + g.expires_in * 1000 }
}

/**
 * El usuario dueño del token, según GoTrue.
 *
 * Se pregunta en vez de decodificar el JWT a mano: el formato del access token es
 * asunto de Supabase (puede rotar a llaves asimétricas), el endpoint no.
 */
export async function getAuthUser(): Promise<{ id: string; email: string }> {
  const token = await getAccessToken()
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error('No se pudo leer la sesión. Corre `npx ketzal-mcp login`.')
  const j = (await r.json()) as { id?: string; email?: string }
  if (!j.id) throw new Error('La sesión no trae usuario. Corre `npx ketzal-mcp login`.')
  return { id: j.id, email: j.email ?? '' }
}

// ── access token ─────────────────────────────────────────────────────────────

let cached: { token: string; expiresAt: number } | null = null
let refreshing: Promise<string> | null = null

/**
 * Access token vigente. Se usa reloj de pared (`Date.now`) y no monotónico a
 * propósito: si la máquina se suspende, lo que importa es cuánto tiempo real pasó.
 * Se refresca 60s antes de expirar para no perder una carrera con el servidor.
 */
export async function getAccessToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.expiresAt - 60_000) return cached.token
  if (refreshing) return refreshing
  refreshing = doRefresh().finally(() => { refreshing = null })
  return refreshing
}

async function doRefresh(): Promise<string> {
  const stored = await readStored()
  if (!stored) {
    const email = process.env.KETZAL_EMAIL
    const password = process.env.KETZAL_PASSWORD
    if (email && password) {
      log('sin sesión en disco; entrando con KETZAL_EMAIL/KETZAL_PASSWORD')
      await loginWithPassword(email, password)
      return cached!.token
    }
    throw new Error(
      'No hay sesión. Corre `npx ketzal-mcp login` en una terminal para entrar con tu correo.',
    )
  }

  let g: Grant
  try {
    g = asGrant(await gotrue('token?grant_type=refresh_token', { refresh_token: stored.refresh_token }))
  } catch (e) {
    throw new Error(
      `La sesión de ${stored.email} caducó o fue revocada (${(e as Error).message}). ` +
        'Corre `npx ketzal-mcp login` otra vez.',
    )
  }

  // Supabase ROTA el refresh token en cada canje: si no se persiste el nuevo, el
  // siguiente arranque entra con uno ya quemado y el login se pierde solo.
  await writeStored({ email: stored.email, refresh_token: g.refresh_token })
  cached = { token: g.access_token, expiresAt: Date.now() + g.expires_in * 1000 }
  return g.access_token
}
