import { describe, it, expect } from 'vitest'
import {
  lineTotal,
  precioAjustado,
  precioDePack,
  precioDesde,
  subtotal,
  total,
  type BookingLine,
} from './pricing'

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

describe('precioAjustado (b045)', () => {
  it('aplica el % de temporada a 2 decimales', () => {
    expect(precioAjustado(1000, 25)).toBe(1250)
    expect(precioAjustado(600, 25)).toBe(750)
    expect(precioAjustado(1000, -10)).toBe(900)
    expect(precioAjustado(999.99, 0)).toBe(999.99)
  })
  it('redondea mitades correctamente', () => {
    expect(precioAjustado(333.33, 10)).toBe(366.66)
  })
})

describe('precioDePack (b057)', () => {
  it('sin overrides, cae a precioAjustado', () => {
    expect(precioDePack(1000, 'doble', 25)).toBe(1250)
  })
  it('usa el precio especial del pack si existe', () => {
    expect(precioDePack(2399, 'cuadruple', 0, { cuadruple: 2699 })).toBe(2699)
  })
  it('el override manda: ignora el % de la salida', () => {
    expect(precioDePack(2399, 'cuadruple', 50, { cuadruple: 2699 })).toBe(2699)
  })
  it('otro pack sin override en el mismo objeto cae a precioAjustado', () => {
    expect(precioDePack(1000, 'triple', 10, { cuadruple: 2699 })).toBe(1100)
  })
  it('redondea el override a 2 decimales', () => {
    expect(precioDePack(0, 'doble', 0, { doble: 999.995 })).toBe(1000)
  })
})

describe('precioDesde', () => {
  const packs = [
    { key: 'doble', price: 2799 },
    { key: 'triple', price: 2599 },
    { key: 'cuadruple', price: 2399 },
  ]
  it('es el pack más barato resuelto; un override manda sobre el %', () => {
    expect(precioDesde(packs, 2399, 10)).toBe(2638.9)
    expect(precioDesde(packs, 2399, 10, { cuadruple: 2199 })).toBe(2199)
  })
  it('sin packs cae al precio base ajustado', () => {
    expect(precioDesde([], 2399, 0)).toBe(2399)
    expect(precioDesde([], 2000, 25)).toBe(2500)
  })
})
