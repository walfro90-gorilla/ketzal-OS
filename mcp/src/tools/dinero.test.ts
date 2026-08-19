import { describe, expect, it } from 'vitest'
import { aFraccion } from './dinero.js'

describe('aFraccion (enganche)', () => {
  // Guard de regresión: los RPCs del plan reciben FRACCIÓN (`p_down_pct` default
  // 0.20). Mandar el porcentaje crudo daba un enganche de 20 veces el total.
  it('convierte porcentaje a fracción', () => {
    expect(aFraccion(20)).toBeCloseTo(0.2)
    expect(aFraccion(50)).toBeCloseTo(0.5)
    expect(aFraccion(1)).toBeCloseTo(0.01)
    expect(aFraccion(99)).toBeCloseTo(0.99)
  })

  it('usa el default del sistema cuando no se especifica', () => {
    expect(aFraccion(undefined)).toBeCloseTo(0.2)
    expect(aFraccion(null)).toBeCloseTo(0.2)
  })

  it('rechaza porcentajes fuera de rango en vez de mandarlos al RPC', () => {
    for (const malo of [0, 100, 120, -5]) {
      expect(() => aFraccion(malo), `${malo} debería rechazarse`).toThrow(/1% y 99%/)
    }
  })

  it('nunca devuelve un valor que el RPC leería como múltiplo del total', () => {
    for (const pct of [1, 20, 33, 99]) expect(aFraccion(pct)).toBeLessThan(1)
  })
})
