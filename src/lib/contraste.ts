// Contraste WCAG 2.1 entre dos colores hex (#RRGGBB). Módulo hoja, puro:
// lo usan /styleguide (tabla medida en render) y su test (la tabla de la spec).
// Los ratios del rediseño de la home se MIDEN aquí, no se copian de una tabla.

function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`color inválido: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ratio de contraste (1..21), redondeado a 2 decimales. */
export function contraste(fg: string, bg: string): number {
  const [a, b] = [luminancia(fg), luminancia(bg)].sort((x, y) => y - x)
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100
}

export type Veredicto = 'AAA' | 'AA' | 'AA grande' | 'falla'

/** WCAG 2.1: 7 = AAA texto normal · 4.5 = AA texto normal · 3 = AA solo ≥18px / UI. */
export function veredicto(ratio: number): Veredicto {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA grande'
  return 'falla'
}
