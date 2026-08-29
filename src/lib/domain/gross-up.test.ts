import { describe, expect, it } from 'vitest'
import { grossUpMp } from './gross-up'

// Tasa real de la cuenta MP del fundador (2026-08-29): 3.49% + $4 + IVA 16%.
const TASAS = { pct: 3.49, fijo: 4.0, iva: 16 }

describe('grossUpMp', () => {
  it('el vendedor recibe el monto íntegro tras el fee de MP', () => {
    // Viaje $7,999. Con gross-up el viajero paga costoFinal; MP descuenta su fee
    // (pct sobre costoFinal + fijo, con IVA); debe quedar ~$7,999 para repartir.
    const { costoFinal, cargoProcesamiento } = grossUpMp(7999, TASAS)
    const factor = 1.16
    const feeMp = costoFinal * (3.49 / 100) * factor + 4.0 * factor
    // Lo que queda tras el fee de MP debe volver al monto original (± centavo de redondeo).
    expect(costoFinal - feeMp).toBeCloseTo(7999, 0)
    expect(cargoProcesamiento).toBeCloseTo(costoFinal - 7999, 2)
    // Y el cargo es positivo y razonable (~4% + fijo).
    expect(cargoProcesamiento).toBeGreaterThan(330)
    expect(cargoProcesamiento).toBeLessThan(360)
  })

  it('costoFinal = monto + cargo, siempre', () => {
    for (const m of [50, 1800, 7999, 12345.67]) {
      const g = grossUpMp(m, TASAS)
      expect(g.costoFinal).toBeCloseTo(m + g.cargoProcesamiento, 2)
    }
  })

  it('sin tasas no hay gross-up', () => {
    expect(grossUpMp(1000, { pct: 0, fijo: 0, iva: 0 })).toEqual({
      costoFinal: 1000,
      cargoProcesamiento: 0,
    })
  })

  it('monto no positivo o inválido ⇒ cero', () => {
    expect(grossUpMp(0, TASAS)).toEqual({ costoFinal: 0, cargoProcesamiento: 0 })
    expect(grossUpMp(-5, TASAS)).toEqual({ costoFinal: 0, cargoProcesamiento: 0 })
    expect(grossUpMp(NaN, TASAS)).toEqual({ costoFinal: 0, cargoProcesamiento: 0 })
  })

  it('tasa imposible (>=100% con IVA) degrada a sin fee, no explota', () => {
    const g = grossUpMp(1000, { pct: 90, fijo: 0, iva: 16 }) // 90%*1.16 = 104.4% >= 1
    expect(g).toEqual({ costoFinal: 1000, cargoProcesamiento: 0 })
  })
})
