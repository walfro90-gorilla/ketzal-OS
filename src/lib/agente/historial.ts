/**
 * El hilo del asistente, guardado en el navegador.
 *
 * Vive en `localStorage` (no `sessionStorage`): la idea es poder releer lo que
 * ya se trabajó, y eso exige sobrevivir a cerrar la pestaña. Sigue siendo por
 * navegador y por aparato — no hay tabla. Cuando el asistente se abra a los
 * admins de agencia o se quiera desde el celular, ahí sí toca BD con RLS por
 * persona, porque esto guarda nombres de clientes y cifras.
 *
 * Dos cuidados que no son opcionales:
 *
 * 1. **Tamaño.** Un mensaje `tool` puede traer hasta 30k caracteres (MAX_CHARS
 *    de `tools.ts`) y el navegador da ~5 MB para TODO el origen. Sin tope, unas
 *    cuantas consultas grandes llenan la cuota y el `setItem` empieza a tronar
 *    en silencio. Se recorta hasta que quepa, y se recorta con `recortar` para
 *    no partir un turno (un `assistant` con tool_calls sin sus resultados hace
 *    que el proveedor responda 400 en la siguiente pregunta).
 *
 * 2. **Fecha.** Los montos de un hilo viejo son de ese día. Se guarda cuándo se
 *    escribió para que la UI pueda decirlo; releer "$8,000 de saldo" de la
 *    semana pasada como si fuera de hoy es justo lo que ADR-0005 evita en la BD.
 */
import { recortar } from './mensajes'
import type { Mensaje } from './llm'

export const CLAVE = 'ketzal-agente'
/** ~1 MB de los ~5 MB del origen: deja aire para el resto de la app. */
export const MAX_BYTES = 1_000_000
/** Las burbujas son chicas (el resumen va cortado a 160), pero no infinitas. */
export const MAX_ITEMS = 120

export type Guardado<I> = { v: 1; guardadoEn: number; items: I[]; mensajes: Mensaje[] }

/** Serializa el hilo, recortándolo hasta que quepa en la cuota. */
export function empacar<I>(items: I[], mensajes: Mensaje[], ahora = Date.now()): string {
  let msgs = recortar(mensajes)
  let its = items.slice(-MAX_ITEMS)
  const serializar = () =>
    JSON.stringify({ v: 1, guardadoEn: ahora, items: its, mensajes: msgs } satisfies Guardado<I>)

  let raw = serializar()
  // Se tira la mitad más vieja en cada vuelta: converge en pocas pasadas aunque
  // un solo resultado de herramienta sea enorme.
  while (raw.length > MAX_BYTES && (msgs.length > 1 || its.length > 1)) {
    msgs = msgs.length > 1 ? recortar(msgs, Math.floor(msgs.length / 2)) : []
    its = its.slice(Math.ceil(its.length / 2))
    raw = serializar()
  }
  return raw
}

/** Lee lo guardado. Cualquier cosa rara devuelve `null`: el hilo empieza limpio. */
export function desempacar<I>(raw: string | null): Guardado<I> | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as Partial<Guardado<I>>
    if (j?.v !== 1 || !Array.isArray(j.items) || !Array.isArray(j.mensajes)) return null
    return {
      v: 1,
      guardadoEn: typeof j.guardadoEn === 'number' ? j.guardadoEn : 0,
      items: j.items,
      mensajes: j.mensajes,
    }
  } catch {
    return null
  }
}

/**
 * Etiqueta para un hilo que NO es de hoy, o `null` si es de hoy (o sin fecha).
 * La zona es la de la operación: un hilo de anoche no debe verse como "ayer"
 * solo porque el navegador está en otro huso.
 */
export function etiquetaDeFecha(guardadoEn: number, ahora = Date.now()): string | null {
  if (!guardadoEn) return null
  const zona = 'America/Chihuahua'
  const dia = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date(t))
  if (dia(guardadoEn) === dia(ahora)) return null
  const fecha = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'long', timeZone: zona,
  }).format(new Date(guardadoEn))
  return `Conversación del ${fecha}. Los montos son de ese día.`
}
