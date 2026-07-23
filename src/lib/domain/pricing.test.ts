import { describe, it, expect } from 'vitest'
import { lineTotal, subtotal, total, type BookingLine } from './pricing'

// Ruta de dinero: el importe que cobra una venta = Σ(cantidad × precio) − descuento.
// Es lo que persiste create_booking_with_items y de lo que se deriva el saldo.

describe('lineTotal', () => {
  it('multiplica cantidad × precio unitario', () => {
    expect(lineTotal({ qty: 3, unitPrice: 1500 })).toBe(4500)
  })
  it('una sola persona', () => {
    expect(lineTotal({ qty: 1, unitPrice: 999.5 })).toBe(999.5)
  })
  it('cantidad 0 ⇒ 0', () => {
    expect(lineTotal({ qty: 0, unitPrice: 1500 })).toBe(0)
  })
})

describe('subtotal', () => {
  it('sin líneas ⇒ 0', () => {
    expect(subtotal([])).toBe(0)
  })
  it('suma varias líneas (tipos de pasajero + add-ons)', () => {
    const lines: BookingLine[] = [
      { qty: 2, unitPrice: 1500 }, // adultos
      { qty: 1, unitPrice: 900 }, // menor
      { qty: 3, unitPrice: 100 }, // add-on por persona
    ]
    expect(subtotal(lines)).toBe(2 * 1500 + 900 + 3 * 100)
  })
})

describe('total', () => {
  it('descuento por defecto 0 ⇒ total = subtotal', () => {
    expect(total([{ qty: 2, unitPrice: 1000 }])).toBe(2000)
  })
  it('resta el descuento', () => {
    expect(total([{ qty: 2, unitPrice: 1000 }], 500)).toBe(1500)
  })
  it('descuento igual al subtotal ⇒ 0 (cortesía completa)', () => {
    expect(total([{ qty: 1, unitPrice: 1200 }], 1200)).toBe(0)
  })
  it('venta vacía ⇒ 0', () => {
    expect(total([])).toBe(0)
  })
})
