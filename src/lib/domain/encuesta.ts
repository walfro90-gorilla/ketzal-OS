// Investigación de mercado (m002): helpers puros de la encuesta pública.
// Viven aparte de la server action para poder probarlos sin BD ni request.

/** Parámetros de campaña que aceptamos guardar en poll_votes.meta. */
const UTM_PERMITIDOS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
] as const

/**
 * Whitelist de UTM: el query string de un anuncio es entrada de terceros, así
 * que solo copiamos las llaves conocidas y recortamos el valor. Sin esto, un
 * link manipulado infla `meta` hasta el tope de 4KB del RPC.
 */
export function filtrarUtm(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of UTM_PERMITIDOS) {
    const raw = params[k]
    const v = Array.isArray(raw) ? raw[0] : raw
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200)
  }
  return out
}

/** Primer día del mes de una fecha 'YYYY-MM' o 'YYYY-MM-DD' (sin zona horaria). */
export function primerDiaDelMes(mes: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(mes)
  if (!m) return null
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) return null
  return `${m[1]}-${m[2]}-01`
}

/** Cuántos meses abarca el rango, contando ambos extremos. 0 si no es válido. */
export function largoDelRango(desde: string, hasta: string): number {
  const d = primerDiaDelMes(desde)
  const h = primerDiaDelMes(hasta)
  if (!d || !h || d > h) return 0
  return (
    (Number(h.slice(0, 4)) - Number(d.slice(0, 4))) * 12 +
    (Number(h.slice(5, 7)) - Number(d.slice(5, 7))) +
    1
  )
}

/** Los meses seleccionables de una encuesta, como 'YYYY-MM'. Tope de 24 por si el rango viene absurdo. */
export function mesesDelRango(desde: string, hasta: string): string[] {
  const d = primerDiaDelMes(desde)
  const h = primerDiaDelMes(hasta)
  if (!d || !h || d > h) return []
  const out: string[] = []
  let [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))]
  const [hy, hm] = [Number(h.slice(0, 4)), Number(h.slice(5, 7))]
  while ((y < hy || (y === hy && m <= hm)) && out.length < 24) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '2026-11' → 'noviembre 2026'. Formateo manual: `new Date('2026-11')` corre la zona horaria. */
export function etiquetaMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes)
  if (!m) return mes
  const i = Number(m[2]) - 1
  return i >= 0 && i < 12 ? `${MESES_ES[i]} ${m[1]}` : mes
}

/** Normaliza las opciones que captura el form: recorta, descarta vacías y asigna ids estables. */
export function normalizarOpciones(labels: string[]): { id: number; label: string }[] {
  return labels
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((label, i) => ({ id: i + 1, label: label.slice(0, 60) }))
}

/**
 * Campo CSV seguro. A diferencia del export de /reportes —que solo saca datos
 * internos— aquí `suggestion` y `contact` los escribe cualquiera que abra la
 * liga del anuncio: un valor que empiece con `=`, `+`, `-`, `@` o un control
 * lo ejecuta Excel/Sheets al abrir el archivo. Se antepone una comilla simple
 * para que entre como texto, y se dobla la comilla doble como manda el CSV.
 */
export function campoCsv(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  const peligroso = /^[=+\-@\t\r]/.test(s)
  return `"${(peligroso ? `'${s}` : s).replace(/"/g, '""')}"`
}

// El link de WhatsApp de un lead se arma con el mismo normalizador que el resto
// de la app: vive en `domain/phone.ts`. Se re-exporta para no romper los imports.
export { linkWhatsapp } from './phone'
