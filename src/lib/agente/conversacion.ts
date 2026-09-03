/**
 * El loop del asistente: LLM ↔ herramientas, con la persona en medio.
 *
 * Sin estado en el servidor: el cliente manda la conversación completa (formato
 * OpenAI) y recibe eventos NDJSON conforme pasan. Una herramienta de dinero o
 * destructiva NO se corre sola: se emite `confirmar` y se corta; el cliente
 * vuelve a mandar la misma conversación con el id aprobado (o con un mensaje
 * `tool` de cancelación) y el loop la retoma donde iba.
 */
import type { ToolDef } from '../../../mcp/src/tools/tipos'
import { completar as completarReal, type Completar, type Mensaje, type ToolCall, type ToolSpec } from './llm'
import {
  buscarHerramienta,
  ejecutar as ejecutarReal,
  especificaciones,
  pideConfirmacion,
  type Ejecutar,
} from './tools'

export type Evento =
  | { tipo: 'texto'; texto: string; proveedor?: string }
  | { tipo: 'tool'; id: string; herramienta: string; titulo: string; args: Record<string, unknown> }
  | { tipo: 'resultado'; id: string; ok: boolean; resumen: string }
  | { tipo: 'confirmar'; id: string; herramienta: string; titulo: string; args: Record<string, unknown> }
  | { tipo: 'error'; texto: string }
  | { tipo: 'fin'; mensajes: Mensaje[] }

export type Deps = {
  completar: Completar
  ejecutar: Ejecutar
  buscar: (nombre: string) => ToolDef | undefined
  tools: ToolSpec[]
}

/** Llamadas al LLM por petición. Freno anti-bucle; la persona decide si sigue. */
export const MAX_PASOS = 12
/** Mensajes de historial que viajan al LLM. */
export const MAX_MENSAJES = 60

let specsCache: ToolSpec[] | null = null
export function depsReales(): Deps {
  specsCache ??= especificaciones()
  return { completar: completarReal, ejecutar: ejecutarReal, buscar: buscarHerramienta, tools: specsCache }
}

export function promptSistema(p: { nombre: string | null; email: string | null; hoy?: string }): string {
  const hoy =
    p.hoy ??
    new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: 'America/Chihuahua' }).format(new Date())
  return (
    `Eres el asistente interno de Ketzal OS, el back-office de agencias de viaje. ` +
    `Hablas con ${p.nombre ?? p.email ?? 'la persona'}${p.email ? ` (${p.email})` : ''}, ` +
    `superadmin de la plataforma: ve todas las agencias. Hoy es ${hoy} (hora de Chihuahua).\n\n` +
    'Reglas:\n' +
    '- Trabajas SOLO con las herramientas. Ningún número se calcula: montos (MXN), saldos, fechas y folios ' +
    'se leen del sistema y se reportan tal cual. No inventes ids: consíguelos con una herramienta de ' +
    'búsqueda antes de escribir.\n' +
    '- Las operaciones de dinero y los borrados los confirma la persona con un clic en una tarjeta que el ' +
    'sistema muestra solo: no le pidas que confirme por escrito ni insistas. Si la cancela, no la repitas.\n' +
    '- Ante una escritura ambigua (¿qué cliente?, ¿qué salida?) pregunta primero; ante una obvia, hazla.\n' +
    '- Si una herramienta devuelve error, léelo y corrige los argumentos o explica qué falta. No insistas ' +
    'más de dos veces con lo mismo.\n' +
    '- Responde en español de México, corto y directo, en texto plano: guiones para listas, sin markdown ' +
    'ni tablas (las negritas con ** sí se ven bien). Si tienes la liga de un documento (recibo, voucher, cotización), pégala completa.'
  )
}

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

function parseArgs(s: string): Record<string, unknown> | null {
  try {
    const j: unknown = JSON.parse(s?.trim() || '{}')
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function correr(
  historial: Mensaje[],
  aprobados: Set<string>,
  sistema: string,
  emitir: (e: Evento) => void,
  deps: Deps = depsReales(),
): Promise<void> {
  const conv: Mensaje[] = [{ role: 'system', content: sistema }, ...recortar(historial)]
  const terminar = () => emitir({ tipo: 'fin', mensajes: conv.slice(1) })

  for (let paso = 0; paso < MAX_PASOS; paso++) {
    for (const call of pendientes(conv)) {
      const t = deps.buscar(call.function.name)
      const args = parseArgs(call.function.arguments)
      if (!t || !args) {
        const content = !t
          ? `Error: no existe la herramienta ${call.function.name}.`
          : 'Error: los argumentos no son un objeto JSON válido.'
        conv.push({ role: 'tool', tool_call_id: call.id, content })
        continue
      }
      if (pideConfirmacion(t) && !aprobados.has(call.id)) {
        emitir({ tipo: 'confirmar', id: call.id, herramienta: t.name, titulo: t.title, args })
        return terminar()
      }
      emitir({ tipo: 'tool', id: call.id, herramienta: t.name, titulo: t.title, args })
      const r = await deps.ejecutar(t, args)
      emitir({ tipo: 'resultado', id: call.id, ok: r.ok, resumen: r.texto.slice(0, 160) })
      conv.push({ role: 'tool', tool_call_id: call.id, content: r.texto })
    }

    const { mensaje, proveedor } = await deps.completar(conv, deps.tools)
    conv.push(mensaje)
    if (mensaje.content?.trim()) emitir({ tipo: 'texto', texto: mensaje.content, proveedor })
    if (!mensaje.tool_calls?.length) return terminar()
  }

  // Se quedó pidiendo herramientas: se tira ese último turno para que la
  // siguiente petición no lo ejecute a espaldas de la persona.
  conv.pop()
  emitir({ tipo: 'texto', texto: 'Me detuve: llevo demasiados pasos seguidos. Dime cómo seguir.' })
  terminar()
}
