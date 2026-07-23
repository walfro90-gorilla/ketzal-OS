// Cantidad con letra (convención mexicana: "DOS MIL PESOS 00/100 M.N.").
// Puramente presentacional: se deriva del monto real, sin tocar datos. Vive en
// el dominio (antes inline en /recibo) para poder testearlo y reusarlo.

const UNIDADES = [
  '', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
  'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
]
// Irregulares con acento / apócope al concatenar "veinti…".
const VEINTIS: Record<number, string> = {
  21: 'veintiún', 22: 'veintidós', 23: 'veintitrés', 26: 'veintiséis',
}
const DECENAS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta',
  'setenta', 'ochenta', 'noventa',
]
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

function decenasALetras(n: number): string {
  if (n <= 20) return UNIDADES[n]
  if (n < 30) return VEINTIS[n] ?? `veinti${UNIDADES[n - 20]}`
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

function centenasALetras(n: number): string {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  return [CENTENAS[c], r ? decenasALetras(r) : ''].filter(Boolean).join(' ')
}

export function enteroALetras(n: number): string {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor(n / 1000) % 1000
  const resto = n % 1000
  const partes: string[] = []
  if (millones) {
    partes.push(millones === 1 ? 'un millón' : `${centenasALetras(millones)} millones`)
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${centenasALetras(miles)} mil`)
  if (resto) partes.push(centenasALetras(resto))
  return partes.join(' ')
}

/** "dos mil quinientos pesos 00/100 M.N." — null si el monto sale de rango. */
export function montoConLetra(monto: number): string | null {
  const cents = Math.round(Math.abs(monto) * 100)
  if (!Number.isFinite(cents) || cents >= 100_000_000_000) return null
  const entero = Math.floor(cents / 100)
  const centavos = cents % 100
  const pesos = entero === 1 ? 'peso' : 'pesos'
  // "un millón DE pesos" solo cuando el entero es millón exacto.
  const de = entero >= 1_000_000 && entero % 1_000_000 === 0 ? ' de' : ''
  return `${enteroALetras(entero)}${de} ${pesos} ${String(centavos).padStart(2, '0')}/100 M.N.`
}
