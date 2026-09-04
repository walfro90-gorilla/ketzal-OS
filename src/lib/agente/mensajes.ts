/**
 * Helpers PUROS sobre la lista de mensajes. Módulo hoja a propósito: solo
 * importa el tipo `Mensaje`, así que lo puede usar tanto el loop del servidor
 * (`conversacion.ts`) como el guardado en el navegador (`historial.ts`).
 *
 * Vivían en `conversacion.ts`, pero ese módulo llega a `mcp/src/session.ts` y
 * de ahí a `node:async_hooks`; importarlo desde un componente de cliente hace
 * que el build de Turbopack falle con "the chunking context does not support
 * external modules". Misma frontera que ADR-0043, del lado contrario.
 */
import type { Mensaje, ToolCall } from './llm'

/** Mensajes de historial que viajan al LLM. */
export const MAX_MENSAJES = 60

/**
 * Recorta el historial sin partir un turno: si la ventana empieza en medio de
 * un `assistant` con tool_calls y sus resultados, el proveedor responde 400.
 * Se avanza hasta el primer mensaje de la persona.
 */
export function recortar(mensajes: Mensaje[], max = MAX_MENSAJES): Mensaje[] {
  if (mensajes.length <= max) return mensajes
  const ventana = mensajes.slice(-max)
  const i = ventana.findIndex((m) => m.role === 'user')
  return i < 0 ? [] : ventana.slice(i)
}

/** Tool calls del último turno del asistente que aún no tienen resultado. */
export function pendientes(conv: Mensaje[]): ToolCall[] {
  let i = conv.length - 1
  while (i >= 0 && conv[i]!.role === 'tool') i--
  const m = conv[i]
  if (!m || m.role !== 'assistant' || !m.tool_calls?.length) return []
  const hechos = new Set(conv.slice(i + 1).map((x) => x.tool_call_id))
  return m.tool_calls.filter((c) => !hechos.has(c.id))
}
