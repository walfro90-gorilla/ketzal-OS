export type BookingLine = { qty: number; unitPrice: number }
export const lineTotal = (l: BookingLine) => l.qty * l.unitPrice
export const subtotal = (lines: BookingLine[]) => lines.reduce((s, l) => s + lineTotal(l), 0)
export const total = (lines: BookingLine[], discount = 0) => subtotal(lines) - discount
