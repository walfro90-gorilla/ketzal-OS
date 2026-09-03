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
import { AsyncLocalStorage } from 'node:async_hooks'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SUPABASE_KEY, SUPABASE_URL } from './config.js'
import { KetzalError } from './errors.js'
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
  // Escritura ATÓMICA (archivo temporal + rename): varios procesos comparten
  // este archivo —el servidor MCP y cualquier `ketzal-mcp` de terminal— y
  // `writeFile` directo deja una ventana en la que otro lee un JSON a medias.
  // `rename` dentro del mismo directorio es atómico en POSIX.
  const tmp = `${p}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, p)
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
  if (!r.ok) throw new KetzalError('No se pudo leer la sesión. Corre `npx ketzal-mcp login`.')
  const j = (await r.json()) as { id?: string; email?: string }
  if (!j.id) throw new KetzalError('La sesión no trae usuario. Corre `npx ketzal-mcp login`.')
  return { id: j.id, email: j.email ?? '' }
}

// ── access token ─────────────────────────────────────────────────────────────

/**
 * Token inyectado por petición. El asistente del OS (`src/app/api/agente`) corre
 * estas mismas herramientas en-proceso con el JWT de la cookie de quien
 * pregunta: si hay uno en el scope, manda sobre el disco. Sin esto un servidor
 * con muchos usuarios compartiría UNA sesión, que es exactamente lo que la RLS
 * no puede tolerar.
 */
export const tokenScope = new AsyncLocalStorage<string>()

let cached: { token: string; expiresAt: number } | null = null
let refreshing: Promise<string> | null = null

/**
 * Access token vigente. Se usa reloj de pared (`Date.now`) y no monotónico a
 * propósito: si la máquina se suspende, lo que importa es cuánto tiempo real pasó.
 * Se refresca 60s antes de expirar para no perder una carrera con el servidor.
 */
export async function getAccessToken(force = false): Promise<string> {
  const inyectado = tokenScope.getStore()
  if (inyectado) return inyectado
  if (!force && cached && Date.now() < cached.expiresAt - 60_000) return cached.token
  if (refreshing) return refreshing
  refreshing = doRefresh().finally(() => { refreshing = null })
  return refreshing
}

/**
 * ¿El fallo del refresh se explica porque OTRO proceso ya rotó el token?
 *
 * El archivo de sesión es compartido (servidor MCP + cualquier `ketzal-mcp` de
 * terminal). Supabase rota el refresh token en cada canje, así que dos procesos
 * que refrescan a la vez presentan el mismo token y el segundo llega tarde. Si
 * en el disco ya hay uno distinto al que usamos, ese es el bueno.
 */
export function otroProcesoRoto(usado: string, enDisco: string | null | undefined): boolean {
  return !!enDisco && enDisco !== usado
}

/**
 * ¿Hay credenciales headless para rehacer el login solo?
 *
 * Es la red que evita la desconexión: Supabase ROTA el refresh token en cada
 * canje y, con varios procesos MCP compartiendo `session.json` (uno por sesión
 * de Claude Code), dos que refresquen a la vez presentan el mismo token. GoTrue
 * lo lee como robo y **revoca la familia entera**: `Refresh Token Not Found`.
 * Sin este fallback, ese momento obliga a un `login` manual por correo.
 */
export function credencialesHeadless(): { email: string; password: string } | null {
  const email = process.env.KETZAL_EMAIL
  const password = process.env.KETZAL_PASSWORD
  return email && password ? { email, password } : null
}

/**
 * Último recurso cuando el refresh token ya no sirve: rehacer el login con las
 * credenciales de entorno. Si no las hay, se pide el login manual de siempre.
 */
async function rehacerLogin(email: string, causa: Error): Promise<string> {
  const cred = credencialesHeadless()
  if (cred) {
    log(`refresh rechazado (${causa.message}); rehaciendo login de ${cred.email}`)
    await loginWithPassword(cred.email, cred.password)
    return cached!.token
  }
  throw new KetzalError(
    `La sesión de ${email} caducó o fue revocada (${causa.message}). ` +
      'Corre `npx ketzal-mcp login` otra vez, o define KETZAL_EMAIL y KETZAL_PASSWORD ' +
      'para que el servidor se reconecte solo.',
  )
}

async function doRefresh(): Promise<string> {
  const stored = await readStored()
  if (!stored) {
    const cred = credencialesHeadless()
    if (cred) {
      log('sin sesión en disco; entrando con KETZAL_EMAIL/KETZAL_PASSWORD')
      await loginWithPassword(cred.email, cred.password)
      return cached!.token
    }
    throw new KetzalError(
      'No hay sesión. Corre `npx ketzal-mcp login` en una terminal para entrar con tu correo.',
    )
  }

  const canjear = async (token: string) =>
    asGrant(await gotrue('token?grant_type=refresh_token', { refresh_token: token }))

  let g: Grant
  try {
    g = await canjear(stored.refresh_token)
  } catch (e) {
    // Reintento único releyendo el disco: si otro proceso ganó la carrera, el
    // token bueno ya está escrito. Sin esto, dos procesos concurrentes se
    // tumban la sesión mutuamente y hay que volver a entrar por correo.
    const fresco = await readStored()
    if (!otroProcesoRoto(stored.refresh_token, fresco?.refresh_token)) {
      return await rehacerLogin(stored.email, e as Error)
    }
    log('otro proceso rotó el token; reintentando con el del disco')
    try {
      g = await canjear(fresco!.refresh_token)
    } catch (e2) {
      return await rehacerLogin(stored.email, e2 as Error)
    }
  }

  // Supabase ROTA el refresh token en cada canje: si no se persiste el nuevo, el
  // siguiente arranque entra con uno ya quemado y el login se pierde solo.
  await writeStored({ email: stored.email, refresh_token: g.refresh_token })
  cached = { token: g.access_token, expiresAt: Date.now() + g.expires_in * 1000 }
  return g.access_token
}
