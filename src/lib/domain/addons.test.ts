import { describe, it, expect } from 'vitest'
import { limpiarAddOns, type AddOnInput } from './addons'

// Add-ons por servicio (lista abierta). El helper es la frontera de confianza:
// valida nombre/precio, sella la key y deduplica — la UI no (espejo de packs).

describe('limpiarAddOns', () => {
  it('sin entrada ⇒ []', () => {
    expect(limpiarAddOns()).toEqual([])
    expect(limpiarAddOns([])).toEqual([])
  })

  it('sella la key desde el nombre (sin acentos, con guiones)', () => {
    const out = limpiarAddOns([{ label: 'Tirolesa Extrema', price: 250 }])
    expect(out).toEqual([{ key: 'tirolesa-extrema', label: 'Tirolesa Extrema', price: 250 }])
  })

  it('descarta renglones sin nombre', () => {
    const out = limpiarAddOns([
      { label: '   ', price: 100 },
      { label: 'Comida', price: 150 },
    ])
    expect(out.map((a) => a.key)).toEqual(['comida'])
  })

  it('descarta precios inválidos (NaN, negativo, cero)', () => {
    const out = limpiarAddOns([
      { label: 'Seguro', price: Number('x') },
      { label: 'Foto', price: -50 },
      { label: 'Gorra', price: 0 },
      { label: 'Comida', price: 150 },
    ] as AddOnInput[])
    expect(out.map((a) => a.key)).toEqual(['comida'])
  })

  it('deduplica por key aunque cambien acentos/mayúsculas (gana el último)', () => {
    const out = limpiarAddOns([
      { label: 'Fotografía', price: 100 },
      { label: 'FOTOGRAFIA', price: 180 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ key: 'fotografia', label: 'FOTOGRAFIA', price: 180 })
  })

  it('conserva el orden de captura (lista abierta, sin orden canónico)', () => {
    const out = limpiarAddOns([
      { label: 'Zeta', price: 10 },
      { label: 'Alfa', price: 20 },
    ])
    expect(out.map((a) => a.label)).toEqual(['Zeta', 'Alfa'])
  })

  it('redondea el precio a 2 decimales', () => {
    const out = limpiarAddOns([{ label: 'Comida', price: 150.005 }])
    expect(out[0].price).toBe(150.01)
  })
})
