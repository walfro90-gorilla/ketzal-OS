/**
 * Itinerario: helpers PUROS que comparten el form (cliente) y los documentos
 * (cotización, mis-compras; servidor).
 *
 * El modelo no cambia: cada día es `{ title, description }` y las acciones
 * son renglones de `description`. La hora va DENTRO del renglón como prefijo
 * "07:00 · texto": así ningún render viejo se rompe y una acción sin hora se
 * ve igual que antes.
 *
 * El día de la semana NO se guarda en el servicio (un mismo tour sale viernes
 * una vez y martes otra): se deriva de la fecha de la salida al pintar.
 */
import { sumarDias } from './temporadas-mx'

export type Accion = { hora: string; texto: string }

const HORA = /^(\d{1,2}):(\d{2})\s*(?:[·\-–]\s*)?(.*)$/

/** "07:00 · Abordaje" → { hora: '07:00', texto: 'Abordaje' }; sin prefijo, hora ''. */
export function partirAccion(linea: string): Accion {
  const m = HORA.exec(linea.trim())
  if (!m) return { hora: '', texto: linea.trim() }
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return { hora: '', texto: linea.trim() }
  return { hora: `${String(h).padStart(2, '0')}:${m[2]}`, texto: m[3].trim() }
}

/** El renglón que se guarda. Sin hora, solo el texto. */
export function unirAccion(a: Accion): string {
  const texto = a.texto.trim()
  return a.hora ? `${a.hora} · ${texto}`.trim() : texto
}

/**
 * "Día 1" o, con la fecha de la salida, "Día 1 · sábado 14 de septiembre".
 * La fecha se ancla al mediodía para que la zona horaria no la corra de día.
 */
export function etiquetaDia(indice: number, fechaSalida?: string | null): string {
  const base = `Día ${indice + 1}`
  if (!fechaSalida || !/^\d{4}-\d{2}-\d{2}/.test(fechaSalida)) return base
  const fecha = new Date(`${sumarDias(fechaSalida.slice(0, 10), indice)}T12:00:00`)
  if (Number.isNaN(fecha.getTime())) return base
  const texto = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(fecha)
  return `${base} · ${texto}`
}
