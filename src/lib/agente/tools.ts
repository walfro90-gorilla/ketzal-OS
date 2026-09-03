/**
 * Las herramientas del asistente SON las del MCP (`mcp/src/tools`): un solo
 * catálogo, y lo que se agregue allá lo tiene el chat gratis. Aquí solo se
 * traducen al dialecto OpenAI y se ejecutan; el JWT de la persona viaja por
 * `tokenScope` (mcp/src/session.ts), así que la RLS decide igual que en el MCP.
 */
import { z } from 'zod'
import { KetzalError } from '../../../mcp/src/errors'
import { ALL_TOOLS } from '../../../mcp/src/tools/index'
import type { ToolDef } from '../../../mcp/src/tools/registry'
import type { ToolSpec } from './llm'

/** Lee archivos del disco de quien corre el MCP: en el servidor no hay tal disco. */
const SIN_SENTIDO_EN_SERVIDOR = new Set(['ketzal_subir_fotos'])

export const HERRAMIENTAS: ToolDef[] = ALL_TOOLS.filter((t) => !SIN_SENTIDO_EN_SERVIDOR.has(t.name))
const porNombre = new Map(HERRAMIENTAS.map((t) => [t.name, t]))

export function buscarHerramienta(nombre: string): ToolDef | undefined {
  return porNombre.get(nombre)
}

/** Pide clic de la persona antes de correr: mueve dinero, o borra/expone. */
export function pideConfirmacion(t: ToolDef): boolean {
  return Boolean(t.money || t.destructive)
}

export function especificaciones(tools: ToolDef[] = HERRAMIENTAS): ToolSpec[] {
  return tools.map((t) => {
    const parameters: Record<string, unknown> = t.inputSchema
      ? z.toJSONSchema(t.inputSchema)
      : { type: 'object', properties: {} }
    // Gemini rechaza llaves que no son del schema de la función.
    delete parameters.$schema
    // `confirmar` NO se le enseña al modelo: lo pone el servidor DESPUÉS del
    // clic de la persona. Enseñarlo lo invita a llenarlo, y un valor inválido
    // ("True" en vez de true) tumba la petición ENTERA con un 400 del
    // validador del proveedor — no solo esa herramienta. Medido con Groq.
    const props = parameters.properties as Record<string, unknown> | undefined
    if (props?.confirmar) {
      delete props.confirmar
      const req = parameters.required
      if (Array.isArray(req)) {
        const resto = (req as string[]).filter((k) => k !== 'confirmar')
        if (resto.length) parameters.required = resto
        else delete parameters.required
      }
    }
    return {
      type: 'function',
      function: { name: t.name, description: t.description, parameters },
    }
  })
}

/**
 * Tope de una respuesta de herramienta. El MCP usa 60k; aquí menos porque el
 * contexto se re-manda completo en cada turno y Groq mide tokens por minuto.
 */
export const MAX_CHARS = 30_000

export type Resultado = { ok: boolean; texto: string }
export type Ejecutar = (t: ToolDef, args: Record<string, unknown>) => Promise<Resultado>

export async function ejecutar(t: ToolDef, args: Record<string, unknown>): Promise<Resultado> {
  try {
    // Las de dinero exigen `confirmar: true` (guard del MCP). Aquí ya lo dio la
    // persona con el clic en la tarjeta: el LLM nunca decide eso solo.
    const valor = await t.handler(t.money ? { ...args, confirmar: true } : args)
    let texto = typeof valor === 'string' ? valor : JSON.stringify(valor)
    if (texto == null) texto = 'null'
    if (texto.length > MAX_CHARS) {
      texto =
        texto.slice(0, MAX_CHARS) +
        `\n… truncado en ${MAX_CHARS} caracteres. Acota la consulta (filtros, fechas o límite).`
    }
    return { ok: true, texto }
  } catch (e) {
    // Un error de negocio es información para el modelo (reintenta con otros
    // argumentos); cualquier otro se esconde y se loguea.
    let msg = 'No se pudo completar la operación.'
    if (e instanceof KetzalError) msg = e.message
    else if (e instanceof z.ZodError) msg = z.prettifyError(e)
    else console.error('[agente] tool', t.name, e)
    return { ok: false, texto: `Error: ${msg}` }
  }
}
