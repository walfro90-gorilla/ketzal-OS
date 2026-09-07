/**
 * Huecos del calendario: `temporadas próximas − salidas que las cubren`
 * (ADR-0058). Función pura: la página, el Clawbot y los tests le pasan los
 * mismos datos y reciben la misma lista.
 *
 * Una temporada está cubierta si alguna salida de la agencia la toca contando
 * `departs_on + duration_days` (sin duración se asume 1 día). Un servicio se
 * sugiere para un hueco si no tiene `meses_ideales` o si alguno de sus meses
 * cae dentro de la temporada: sugerir Huasteca en septiembre (crecidas) quema
 * la confianza en la primera semana.
 */

import { diasEntre, sumarDias, temporadas, type Alcance, type Temporada } from './temporadas-mx'

/** Cuánto hacia adelante se mira. Parámetro, no constante escondida (ADR-0058 §4). */
export const HORIZONTE_DIAS = 120
/** Desde cuántos días antes se avisa a la campana. */
export const ANTICIPACION_DIAS = 28

export type ServicioParaHuecos = {
  id: string
  name: string
  duration_days: number | null
  meses_ideales: number[] | null
}

export type SalidaParaHuecos = {
  service_id: string
  /** YYYY-MM-DD */
  departs_on: string
}

export type EstadoHueco = 'hueco' | 'cubierta' | 'descartada'

export type Oportunidad = {
  /** `${clave}:${año del inicio}`; estable, sirve de llave en la BD. */
  id: string
  temporada: Temporada
  anio: number
  /** Días de hoy al inicio; negativo si ya empezó. */
  diasPara: number
  estado: EstadoHueco
  /** Ids de los servicios con salida que la cubren. */
  cubiertaPor: string[]
  /** Servicios de la agencia que cabrían en la fecha (solo si es hueco). */
  sugeridos: ServicioParaHuecos[]
}

export function idOportunidad(t: Temporada): string {
  return `${t.clave}:${t.inicio.slice(0, 4)}`
}

/** "puente-nov:2026" → la temporada, o null si la clave no existe ese año. */
export function temporadaPorId(id: string): Temporada | null {
  const m = /^([a-z0-9-]+):(\d{4})$/.exec(id)
  if (!m) return null
  return temporadas(Number(m[2])).find((t) => t.clave === m[1]) ?? null
}

/** Meses (1-12) que toca el rango, con vuelta de año. */
function mesesDe(inicio: string, fin: string): Set<number> {
  const out = new Set<number>()
  let cursor = inicio.slice(0, 7)
  const tope = fin.slice(0, 7)
  for (let i = 0; i < 24 && cursor <= tope; i++) {
    const [y, m] = cursor.split('-').map(Number)
    out.add(m)
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out
}

function cubre(salida: SalidaParaHuecos, duracion: number, t: Temporada): boolean {
  const ultimoDia = sumarDias(salida.departs_on, Math.max(1, duracion) - 1)
  return salida.departs_on <= t.fin && ultimoDia >= t.inicio
}

export function oportunidades(p: {
  /** YYYY-MM-DD en la zona de la agencia. */
  hoy: string
  alcances: readonly Alcance[]
  servicios: ServicioParaHuecos[]
  salidas: SalidaParaHuecos[]
  /** Ids (`clave:año`) que la agencia ya descartó. */
  descartadas?: Iterable<string>
  horizonteDias?: number
}): Oportunidad[] {
  const horizonte = p.horizonteDias ?? HORIZONTE_DIAS
  const tope = sumarDias(p.hoy, horizonte)
  const anio = Number(p.hoy.slice(0, 4))
  const descartadas = new Set(p.descartadas ?? [])
  const duracion = new Map(p.servicios.map((s) => [s.id, s.duration_days ?? 1]))

  // Tres años porque el invierno de Y-1 termina en enero de Y, y el horizonte
  // puede cruzar a Y+1.
  const candidatas = [anio - 1, anio, anio + 1]
    .flatMap(temporadas)
    .filter((t) => p.alcances.includes(t.alcance))
    .filter((t) => t.fin >= p.hoy && t.inicio <= tope)

  return candidatas.map((t) => {
    const id = idOportunidad(t)
    const cubiertaPor = [
      ...new Set(
        p.salidas
          .filter((s) => cubre(s, duracion.get(s.service_id) ?? 1, t))
          .map((s) => s.service_id),
      ),
    ]
    const estado: EstadoHueco = cubiertaPor.length
      ? 'cubierta'
      : descartadas.has(id)
        ? 'descartada'
        : 'hueco'
    const meses = mesesDe(t.inicio, t.fin)
    const sugeridos =
      estado === 'hueco'
        ? p.servicios.filter(
            (s) => !s.meses_ideales?.length || s.meses_ideales.some((m) => meses.has(m)),
          )
        : []
    return {
      id,
      temporada: t,
      anio: Number(t.inicio.slice(0, 4)),
      diasPara: diasEntre(p.hoy, t.inicio),
      estado,
      cubiertaPor,
      sugeridos,
    }
  })
}

/** Hoy (YYYY-MM-DD) en la zona de la agencia, no en la del servidor. */
export function hoyEn(zona = 'America/Chihuahua', ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/**
 * Va a la campana: es hueco y ya entró en la ventana de anticipación.
 * El segundo parámetro es un objeto a propósito: `lista.filter(paraAvisar)`
 * manda el índice como segundo argumento, y con un número suelto el índice 0
 * se volvía "anticipación 0 días" y no se emitía nada (pegó en el tick real).
 */
export function paraAvisar(
  o: Oportunidad,
  opts?: { anticipacionDias?: number } | unknown
): boolean {
  const anticipacion =
    opts && typeof opts === 'object' && typeof (opts as { anticipacionDias?: unknown }).anticipacionDias === 'number'
      ? (opts as { anticipacionDias: number }).anticipacionDias
      : ANTICIPACION_DIAS
  return o.estado === 'hueco' && o.diasPara <= anticipacion
}
