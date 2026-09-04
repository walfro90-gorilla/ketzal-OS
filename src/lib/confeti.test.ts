import { afterEach, describe, expect, it, vi } from 'vitest'
import { lanzarConfeti, prefiereMenosMovimiento } from './confeti'

const conMatchMedia = (reduce: boolean | 'revienta') => {
  vi.stubGlobal('window', {
    matchMedia: (q: string) => {
      if (reduce === 'revienta') throw new Error('no soportado')
      return { matches: reduce && q.includes('reduce') }
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('prefiereMenosMovimiento', () => {
  it('sin window (SSR) dice que sí: no hay nada que animar', () => {
    vi.stubGlobal('window', undefined)
    expect(prefiereMenosMovimiento()).toBe(true)
  })
  it('sin matchMedia también dice que sí', () => {
    vi.stubGlobal('window', {})
    expect(prefiereMenosMovimiento()).toBe(true)
  })
  it('lee la preferencia del sistema', () => {
    conMatchMedia(true)
    expect(prefiereMenosMovimiento()).toBe(true)
    conMatchMedia(false)
    expect(prefiereMenosMovimiento()).toBe(false)
  })
  it('si matchMedia revienta, no bloquea la animación', () => {
    conMatchMedia('revienta')
    expect(prefiereMenosMovimiento()).toBe(false)
  })
})

describe('lanzarConfeti', () => {
  it('no anima —ni carga el módulo— si se pidió menos movimiento', async () => {
    conMatchMedia(true)
    await expect(lanzarConfeti()).resolves.toBe(false)
  })
  it('es adorno: si el módulo falla, devuelve false y NO lanza', async () => {
    conMatchMedia(false)
    vi.doMock('canvas-confetti', () => { throw new Error('sin red') })
    await expect(lanzarConfeti()).resolves.toBe(false)
    vi.doUnmock('canvas-confetti')
  })
})
