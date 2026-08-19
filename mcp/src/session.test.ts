import { afterEach, describe, expect, it } from 'vitest'
import { readStored, sessionPath } from './session.js'
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
