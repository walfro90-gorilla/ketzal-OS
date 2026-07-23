import { describe, it, expect } from 'vitest'
import { balance, type LedgerEntry } from './balance'

// Regla de oro #2: el saldo es DERIVADO, nunca un campo mutable.
//   saldo = total − Σ(pagos COMPLETED) + Σ(reembolsos COMPLETED)
// Este es el invariante de dinero más importante de la app.

const pago = (amount: number, status = 'COMPLETED'): LedgerEntry => ({
  type: 'payment',
  amount,
  status,
})
const reembolso = (amount: number, status = 'COMPLETED'): LedgerEntry => ({
  type: 'refund',
  amount,
  status,
})

describe('balance (saldo derivado)', () => {
  it('sin movimientos ⇒ saldo = total', () => {
    expect(balance(5000, [])).toBe(5000)
  })

  it('un abono resta del saldo', () => {
    expect(balance(5000, [pago(2000)])).toBe(3000)
  })

  it('abonos que suman el total ⇒ saldo 0 (liquidada)', () => {
    expect(balance(5000, [pago(2000), pago(3000)])).toBe(0)
  })

  it('un reembolso vuelve a subir el saldo (cancelación parcial)', () => {
    // pagó 5000, se le reembolsó 1000 ⇒ debe 1000 de nuevo
    expect(balance(5000, [pago(5000), reembolso(1000)])).toBe(1000)
  })

  it('reembolso total tras liquidar ⇒ saldo vuelve al total', () => {
    expect(balance(5000, [pago(5000), reembolso(5000)])).toBe(5000)
  })

  it('IGNORA movimientos que no están COMPLETED', () => {
    const entries: LedgerEntry[] = [
      pago(2000, 'COMPLETED'),
      pago(1000, 'PENDING'),
      pago(1500, 'FAILED'),
      reembolso(500, 'PENDING'),
    ]
    // solo cuenta el pago COMPLETED de 2000
    expect(balance(5000, entries)).toBe(3000)
  })

  it('sobrepago ⇒ saldo negativo (a favor del cliente)', () => {
    expect(balance(1000, [pago(1500)])).toBe(-500)
  })

  it('respeta centavos', () => {
    expect(balance(1000.5, [pago(250.25)])).toBeCloseTo(750.25, 2)
  })
})
