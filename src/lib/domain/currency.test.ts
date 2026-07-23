import { describe, it, expect } from 'vitest'
import { round2, toMxn, toUsd } from './currency'

// F6: motor MXN autoritativo. USD se convierte al vender (× TC) y se deriva
// para mostrar (÷ TC). Estos helpers corren en el form de venta y el detalle.

describe('round2', () => {
  it('redondea a centavos', () => {
    expect(round2(17500)).toBe(17500)
    expect(round2(1999.999)).toBe(2000)
    expect(round2(33.333333)).toBe(33.33)
  })
  it('limpia el ruido de punto flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

describe('toMxn (USD → MXN)', () => {
  it('convierte al tipo de cambio', () => {
    expect(toMxn(1000, 17.5)).toBe(17500)
    expect(toMxn(1000, 17.53)).toBe(17530)
  })
  it('redondea a centavos', () => {
    expect(toMxn(1, 0.5)).toBe(0.5)
    expect(toMxn(99.99, 20)).toBe(1999.8)
  })
  it('cero se queda en cero', () => {
    expect(toMxn(0, 17.5)).toBe(0)
  })
})

describe('toUsd (MXN → USD, derivado)', () => {
  it('deriva dividiendo entre el TC', () => {
    expect(toUsd(17500, 17.5)).toBeCloseTo(1000, 6)
    expect(toUsd(17530, 17.53)).toBeCloseTo(1000, 6)
  })
  it('round-trip: convertir a MXN y volver a USD conserva el valor', () => {
    const rate = 17.5
    expect(toUsd(toMxn(1000, rate), rate)).toBeCloseTo(1000, 6)
  })
})
