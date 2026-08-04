export type BookingLine = { qty: number; unitPrice: number }
export const lineTotal = (l: BookingLine) => l.qty * l.unitPrice
export const subtotal = (lines: BookingLine[]) => lines.reduce((s, l) => s + lineTotal(l), 0)
export const total = (lines: BookingLine[], discount = 0) => subtotal(lines) - discount

/** b045: precio con ajuste de temporada (+25 alta, -10 promo), a 2 decimales. */
export const precioAjustado = (price: number, pct: number) =>
  Math.round(price * (1 + pct / 100) * 100) / 100
