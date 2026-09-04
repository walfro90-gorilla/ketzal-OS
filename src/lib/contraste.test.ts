import { describe, expect, it } from 'vitest'
import { contraste, veredicto } from './contraste'

// La tabla de KETZAL_HOME_REDESIGN.md §3 dice "medidas, no estimadas".
// Aquí se miden. Si un número de la spec no cuadra, gana la medición.
const CANVAS = '#081512'
const BLANCO = '#FFFFFF'

describe('contraste WCAG', () => {
  it('reproduce la tabla de la spec (±0.05)', () => {
    const tabla: [string, string, number][] = [
      ['#E6EDEA', CANVAS, 15.68], // text-hi
      ['#9BADA7', CANVAS, 7.93], // text-mid
      ['#6B7F79', CANVAS, 4.38], // text-low
      ['#00C89D', CANVAS, 8.66], // jade-600 — la spec decía 8.57; medido 8.66 (AAA igual)
      ['#009F7D', CANVAS, 5.55], // jade-700
      ['#009F7D', BLANCO, 3.36], // jade-700 sobre blanco: falla AA normal
      ['#027B61', BLANCO, 5.24], // jade-800 sobre blanco
      ['#000000', '#05AE51', 7.18], // negro sobre signal
      ['#DC0419', CANVAS, 3.62], // alert sobre canvas
    ]
    for (const [fg, bg, esperado] of tabla) {
      expect(contraste(fg, bg), `${fg} sobre ${bg}`).toBeCloseTo(esperado, 1)
    }
  })

  it('es simétrico y acotado', () => {
    expect(contraste(CANVAS, BLANCO)).toBe(contraste(BLANCO, CANVAS))
    expect(contraste('#000000', '#FFFFFF')).toBe(21)
    expect(contraste('#123456', '#123456')).toBe(1)
  })

  it('veredictos en los umbrales exactos', () => {
    expect(veredicto(7)).toBe('AAA')
    expect(veredicto(6.99)).toBe('AA')
    expect(veredicto(4.5)).toBe('AA')
    expect(veredicto(4.49)).toBe('AA grande')
    expect(veredicto(3)).toBe('AA grande')
    expect(veredicto(2.99)).toBe('falla')
  })

  it('rechaza lo que no es #RRGGBB', () => {
    expect(() => contraste('#12292322', CANVAS)).toThrow(/inválido/)
    expect(() => contraste('jade', CANVAS)).toThrow(/inválido/)
  })
})
