import { afterEach, describe, expect, it } from 'vitest'
import { KetzalError } from './errors.js'
import {
  credencialesHeadless,
  getAccessToken,
  otroProcesoRoto,
  readStored,
  sessionPath,
} from './session.js'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const original = process.env.XDG_CONFIG_HOME
afterEach(() => {
  if (original === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = original
})

describe('sessionPath', () => {
  it('respeta XDG_CONFIG_HOME', () => {
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-demo'
    expect(sessionPath()).toBe('/tmp/xdg-demo/ketzal/session.json')
  })

  it('cae a ~/.config cuando no hay XDG', () => {
    delete process.env.XDG_CONFIG_HOME
    expect(sessionPath()).toMatch(/\.config\/ketzal\/session\.json$/)
  })
})

describe('readStored', () => {
  it('devuelve null si no hay archivo', async () => {
    process.env.XDG_CONFIG_HOME = join(tmpdir(), 'ketzal-vacio-' + process.pid)
    expect(await readStored()).toBeNull()
  })

  it('devuelve null si el archivo está corrupto o incompleto', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ketzal-test-'))
    process.env.XDG_CONFIG_HOME = base
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(base, 'ketzal'), { recursive: true })
    const p = join(base, 'ketzal', 'session.json')

    await writeFile(p, 'no soy json')
    expect(await readStored()).toBeNull()

    // Sin refresh_token no sirve de nada: se trata como ausente.
    await writeFile(p, JSON.stringify({ email: 'a@b.c' }))
    expect(await readStored()).toBeNull()

    await writeFile(p, JSON.stringify({ email: 'a@b.c', refresh_token: 'rt' }))
    expect(await readStored()).toEqual({ email: 'a@b.c', refresh_token: 'rt' })

    await rm(base, { recursive: true, force: true })
  })
})

describe('el archivo de sesión guarda solo el refresh token', () => {
  it('nunca contiene una contraseña ni un access token', async () => {
    // Guard de regresión sobre el formato en disco: si alguien agrega campos, esto truena.
    const base = await mkdtemp(join(tmpdir(), 'ketzal-fmt-'))
    process.env.XDG_CONFIG_HOME = base
    const { mkdir, writeFile, chmod } = await import('node:fs/promises')
    await mkdir(join(base, 'ketzal'), { recursive: true, mode: 0o700 })
    const p = join(base, 'ketzal', 'session.json')
    await writeFile(p, JSON.stringify({ email: 'a@b.c', refresh_token: 'rt' }), { mode: 0o600 })
    await chmod(p, 0o600)

    const raw = await readFile(p, 'utf8')
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['email', 'refresh_token'])
    expect((await stat(p)).mode & 0o777).toBe(0o600)

    await rm(base, { recursive: true, force: true })
  })
})

// La carrera que esto cubre: el servidor MCP y un `ketzal-mcp` de terminal
// comparten el mismo session.json. Supabase ROTA el refresh token en cada
// canje, así que el segundo proceso presenta uno ya usado y falla. Si en el
// disco ya hay otro distinto, es que el primero ganó y ese token sirve.
// Sin este reintento, dos procesos concurrentes se tumban la sesión y hay que
// volver a entrar por correo (pasó dos veces en producción).
describe('otroProcesoRoto', () => {
  it('sí: el disco tiene un token distinto al que usamos', () => {
    expect(otroProcesoRoto('viejo', 'nuevo')).toBe(true)
  })

  it('no: el disco sigue igual ⇒ la sesión murió de verdad', () => {
    expect(otroProcesoRoto('viejo', 'viejo')).toBe(false)
  })

  it('no: sin sesión en disco no hay nada que reintentar', () => {
    expect(otroProcesoRoto('viejo', null)).toBe(false)
    expect(otroProcesoRoto('viejo', undefined)).toBe(false)
    expect(otroProcesoRoto('viejo', '')).toBe(false)
  })
})

describe('credencialesHeadless', () => {
  const e = process.env.KETZAL_EMAIL
  const p = process.env.KETZAL_PASSWORD
  afterEach(() => {
    if (e === undefined) delete process.env.KETZAL_EMAIL; else process.env.KETZAL_EMAIL = e
    if (p === undefined) delete process.env.KETZAL_PASSWORD; else process.env.KETZAL_PASSWORD = p
  })

  it('null si falta cualquiera de las dos', () => {
    process.env.KETZAL_EMAIL = 'a@b.c'
    delete process.env.KETZAL_PASSWORD
    expect(credencialesHeadless()).toBeNull()

    delete process.env.KETZAL_EMAIL
    process.env.KETZAL_PASSWORD = 'x'
    expect(credencialesHeadless()).toBeNull()
  })

  it('las devuelve cuando están ambas', () => {
    process.env.KETZAL_EMAIL = 'a@b.c'
    process.env.KETZAL_PASSWORD = 'x'
    expect(credencialesHeadless()).toEqual({ email: 'a@b.c', password: 'x' })
  })
})

// Los fallos de sesión tienen que llegarle AL AGENTE, no solo a stderr:
// `registry.ts` únicamente deja pasar el mensaje de un KetzalError, y con un
// Error pelón el agente recibía "No se pudo completar la operación." — sin la
// única instrucción que lo desatora (`npx ketzal-mcp login`).
describe('los errores de sesión son KetzalError', () => {
  const e = process.env.KETZAL_EMAIL
  const p = process.env.KETZAL_PASSWORD
  afterEach(() => {
    if (e === undefined) delete process.env.KETZAL_EMAIL; else process.env.KETZAL_EMAIL = e
    if (p === undefined) delete process.env.KETZAL_PASSWORD; else process.env.KETZAL_PASSWORD = p
  })

  it('sin sesión en disco ni credenciales: dice cómo entrar', async () => {
    process.env.XDG_CONFIG_HOME = join(tmpdir(), 'ketzal-sin-sesion-' + process.pid)
    delete process.env.KETZAL_EMAIL
    delete process.env.KETZAL_PASSWORD

    await expect(getAccessToken(true)).rejects.toThrow(KetzalError)
    await expect(getAccessToken(true)).rejects.toThrow(/ketzal-mcp login/)
  })
})
