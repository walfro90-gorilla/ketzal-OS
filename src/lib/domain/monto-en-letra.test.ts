import { describe, it, expect } from 'vitest'
import { montoConLetra, enteroALetras } from './monto-en-letra'

// Cantidad con letra del recibo (documento de dinero). Convención mexicana.

describe('montoConLetra', () => {
  it('cero', () => {
    expect(montoConLetra(0)).toBe('cero pesos 00/100 M.N.')
  })
  it('singular: un peso', () => {
    expect(montoConLetra(1)).toBe('un peso 00/100 M.N.')
  })
  it('plural: dos pesos', () => {
    expect(montoConLetra(2)).toBe('dos pesos 00/100 M.N.')
  })
  it('centavos con padding', () => {
    expect(montoConLetra(2500.5)).toBe('dos mil quinientos pesos 50/100 M.N.')
    expect(montoConLetra(0.1)).toBe('cero pesos 10/100 M.N.')
  })
  it('cien exacto', () => {
    expect(montoConLetra(100)).toBe('cien pesos 00/100 M.N.')
  })
  it('irregular veintiún', () => {
    expect(montoConLetra(21)).toBe('veintiún pesos 00/100 M.N.')
  })
  it('mil', () => {
    expect(montoConLetra(1000)).toBe('mil pesos 00/100 M.N.')
  })
  it('un millón exacto lleva "de"', () => {
    expect(montoConLetra(1_000_000)).toBe('un millón de pesos 00/100 M.N.')
    expect(montoConLetra(2_000_000)).toBe('dos millones de pesos 00/100 M.N.')
  })
  it('millón NO exacto no lleva "de"', () => {
    expect(montoConLetra(1_500_000)).toBe(
      'un millón quinientos mil pesos 00/100 M.N.'
    )
  })
  it('usa el valor absoluto (reembolsos)', () => {
    expect(montoConLetra(-100)).toBe('cien pesos 00/100 M.N.')
  })
  it('fuera de rango o inválido ⇒ null', () => {
    expect(montoConLetra(1_000_000_000)).toBeNull()
    expect(montoConLetra(Number.NaN)).toBeNull()
  })
  it('redondea a centavos', () => {
    // 10.005 → 1000.5 centavos → 1001 → 10 pesos 01/100
    expect(montoConLetra(10.005)).toBe('diez pesos 01/100 M.N.')
  })
})

describe('enteroALetras', () => {
  it('casos base', () => {
    expect(enteroALetras(0)).toBe('cero')
    expect(enteroALetras(21)).toBe('veintiún')
    expect(enteroALetras(100)).toBe('cien')
    expect(enteroALetras(1_000_000)).toBe('un millón')
    expect(enteroALetras(2_500)).toBe('dos mil quinientos')
  })
})
