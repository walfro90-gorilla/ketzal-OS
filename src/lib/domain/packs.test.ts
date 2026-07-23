import { describe, it, expect } from 'vitest'
import { limpiarPacks, type PackInput } from './packs'

// Paquetes por ocupación (precio por persona). El helper es la frontera de
// confianza: valida tipo, sanea precio, deduplica y sella el label — la UI no.

describe('limpiarPacks', () => {
  it('sin entrada ⇒ []', () => {
    expect(limpiarPacks()).toEqual([])
    expect(limpiarPacks([])).toEqual([])
  })

  it('sella el label desde el helper, no desde la UI', () => {
    const out = limpiarPacks([{ key: 'sencilla', price: 1000 } as PackInput])
    expect(out).toEqual([{ key: 'sencilla', label: 'Sencilla (1 persona)', price: 1000 }])
  })

  it('descarta tipos desconocidos', () => {
    const out = limpiarPacks([
      { key: 'presidencial', price: 9999 },
      { key: 'doble', price: 1800 },
    ] as PackInput[])
    expect(out.map((p) => p.key)).toEqual(['doble'])
  })

  it('descarta precios inválidos (NaN, negativo)', () => {
    const out = limpiarPacks([
      { key: 'sencilla', price: Number('x') },
      { key: 'doble', price: -100 },
      { key: 'triple', price: 0 }, // 0 es válido (>= 0)
    ] as PackInput[])
    expect(out.map((p) => p.key)).toEqual(['triple'])
    expect(out[0].price).toBe(0)
  })

  it('deduplica por tipo (gana el último)', () => {
    const out = limpiarPacks([
      { key: 'doble', price: 1000 },
      { key: 'doble', price: 1800 },
    ] as PackInput[])
    expect(out).toHaveLength(1)
    expect(out[0].price).toBe(1800)
  })

  it('devuelve en orden canónico sin importar el orden de entrada', () => {
    const out = limpiarPacks([
      { key: 'cuadruple', price: 400 },
      { key: 'sencilla', price: 1000 },
      { key: 'triple', price: 600 },
    ] as PackInput[])
    expect(out.map((p) => p.key)).toEqual(['sencilla', 'triple', 'cuadruple'])
  })

  it('redondea el precio a 2 decimales', () => {
    const out = limpiarPacks([{ key: 'sencilla', price: 1000.005 } as PackInput])
    expect(out[0].price).toBe(1000.01)
  })
})
