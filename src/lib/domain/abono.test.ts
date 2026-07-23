import { describe, it, expect } from 'vitest'
import { validarCobro } from './abono'

// Guard de dinero del cobro en línea: no se puede cobrar 0/negativo ni más que
// el saldo. (El registro real y el saldo autoritativo viven en el ledger.)

describe('validarCobro', () => {
  it('monto en (0, saldo] ⇒ ok', () => {
    expect(validarCobro('500', 1000)).toBe('ok')
    expect(validarCobro('1000', 1000)).toBe('ok') // exacto = liquidar
    expect(validarCobro('0.01', 1000)).toBe('ok')
  })

  it('vacío / no numérico / ≤ 0 ⇒ no_positivo', () => {
    expect(validarCobro('', 1000)).toBe('no_positivo')
    expect(validarCobro('   ', 1000)).toBe('no_positivo')
    expect(validarCobro('abc', 1000)).toBe('no_positivo')
    expect(validarCobro('0', 1000)).toBe('no_positivo')
    expect(validarCobro('-50', 1000)).toBe('no_positivo')
  })

  it('mayor que el saldo ⇒ excede_saldo (no se cobra de más)', () => {
    expect(validarCobro('1500', 1000)).toBe('excede_saldo')
    expect(validarCobro('1000.01', 1000)).toBe('excede_saldo')
  })

  it('saldo 0 (liquidada) ⇒ cualquier monto positivo excede', () => {
    expect(validarCobro('1', 0)).toBe('excede_saldo')
  })
})
