export type BookingLine = { qty: number; unitPrice: number }
export const lineTotal = (l: BookingLine) => l.qty * l.unitPrice
export const subtotal = (lines: BookingLine[]) => lines.reduce((s, l) => s + lineTotal(l), 0)
export const total = (lines: BookingLine[], discount = 0) => subtotal(lines) - discount

/** b045: precio con ajuste de temporada (+25 alta, -10 promo), a 2 decimales. */
export const precioAjustado = (price: number, pct: number) =>
  Math.round(price * (1 + pct / 100) * 100) / 100

export type PackPriceOverrides = Record<string, number>

/**
 * b057: precio de un pack en una salida. Si la salida trae un precio especial
 * para ese pack (promo donde cada ocupación sube un monto distinto, no un
 * mismo %), lo usa tal cual; si no, cae a precioAjustado con el % uniforme.
 */
export const precioDePack = (
  price: number,
  packKey: string,
  pct: number,
  overrides?: PackPriceOverrides | null
) => {
  const o = overrides?.[packKey]
  return o != null ? Math.round(o * 100) / 100 : precioAjustado(price, pct)
}

/**
 * Precio "desde" de una salida: el pack más barato ya resuelto (override o %).
 * Sin packs, el precio base ajustado por temporada.
 */
export const precioDesde = (
  packs: { key: string; price: number }[],
  base: number,
  pct: number,
  overrides?: PackPriceOverrides | null
) =>
  packs.length
    ? Math.min(...packs.map((p) => precioDePack(p.price, p.key, pct, overrides)))
    : precioAjustado(base, pct)
