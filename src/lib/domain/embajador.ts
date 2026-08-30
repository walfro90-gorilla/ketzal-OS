// Investigación de campo, no de laboratorio: el embajador es alguien que va a
// compartir viajes por WhatsApp desde su teléfono. Estos helpers arman lo que
// se le manda y lo que ve, para que no dependa de que alguien le explique.

export type TarifaEmbajador = {
  /** 'percent' | 'fijo_venta' | 'fijo_pax' | 'hibrido' (basis de commission_rules). */
  basis: string
  /** Porcentaje 0-100 (percent e hibrido). */
  rate: number | null
  /** Monto fijo en MXN (fijo_venta, fijo_pax e hibrido). */
  unit_amount: number | null
}

const mxn = (n: number): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

/**
 * La tarifa en una frase que el embajador entienda sin saber qué es una "basis".
 * Null si no hay tarifa configurada — el portal debe decirlo, no inventar un 0.
 */
export function explicarTarifa(t: TarifaEmbajador | null): string | null {
  if (!t) return null
  const pct = t.rate != null ? `${Number(t.rate)}%` : null
  const fijo = t.unit_amount != null ? mxn(Number(t.unit_amount)) : null
  switch (t.basis) {
    case 'percent':
      return pct && `Ganas ${pct} de cada viaje que vendas.`
    case 'fijo_venta':
      return fijo && `Ganas ${fijo} por cada venta que traigas.`
    case 'fijo_pax':
      return fijo && `Ganas ${fijo} por cada persona que viaje.`
    case 'hibrido':
      return pct && fijo
        ? `Ganas ${pct} de la venta más ${fijo} por cada persona que viaje.`
        : null
    default:
      return null
  }
}

/** Link de referido del embajador. Es la vitrina, no una ficha suelta: así puede
 *  compartir "los viajes" y cualquiera que compre le cuenta. */
export function linkReferido(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/explora?ref=${encodeURIComponent(code)}`
}

/** Mensaje que el admin le manda al embajador con su acceso. */
export function mensajeBienvenida(nombre: string, link: string): string {
  const quien = nombre.trim().split(/\s+/)[0] || 'Hola'
  return [
    `¡${quien}, ya eres embajador de Ketzal! 🎉`,
    '',
    'Entra con este enlace para ver tu panel, tu link de referido y lo que vas ganando:',
    link,
    '',
    'El enlace es de un solo uso y personal — no lo compartas.',
  ].join('\n')
}

/** Mensaje sugerido para que el embajador comparta viajes con su gente. */
export function mensajeParaCompartir(link: string): string {
  return [
    '¿Ya viste estos viajes? 🚌✨',
    'Salidas desde Juárez, apartas con el mínimo y pagas en abonos.',
    link,
  ].join('\n')
}

/** `https://wa.me/?text=…` — abre WhatsApp con el mensaje ya escrito. */
export function waCompartir(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}
