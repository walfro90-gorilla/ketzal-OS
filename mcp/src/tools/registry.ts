/**
 * Contrato de las herramientas.
 *
 * Cada archivo de dominio exporta un `ToolDef[]` y no sabe nada de MCP: devuelve
 * un valor plano y aquí se formatea, se anota y se le pone el freno de escritura.
 * Así los dominios se pueden escribir en paralelo sin tocarse entre ellos.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { READ_ONLY } from '../config.js'
import { KetzalError } from '../errors.js'
import { requireConfirm, spendWrite } from '../guard.js'
import { log } from '../log.js'
import type { ToolDef } from './tipos.js'

export type { ToolDef } from './tipos.js'


/**
 * Tope de tamaño de una respuesta. Una lista larga puede ahogar el contexto del
 * agente y dejarlo sin espacio para razonar; mejor truncar y decirlo.
 */
const MAX_CHARS = 60_000

function formatear(valor: unknown) {
  let texto = typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2)
  if (texto == null) texto = 'null'
  if (texto.length > MAX_CHARS) {
    texto =
      texto.slice(0, MAX_CHARS) +
      `\n\n… truncado en ${MAX_CHARS} caracteres. Acota la consulta (filtros, rango de fechas o límite).`
  }
  return { content: [{ type: 'text' as const, text: texto }] }
}

export function registrar(server: McpServer, tools: ToolDef[]): number {
  let n = 0
  for (const t of tools) {
    if (READ_ONLY && t.write) continue
    n++
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        ...(t.inputSchema ? { inputSchema: t.inputSchema } : {}),
        annotations: {
          readOnlyHint: !t.write,
          destructiveHint: Boolean(t.money || t.destructive),
          idempotentHint: Boolean(t.idempotent),
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          if (t.money) requireConfirm(args?.confirmar)
          if (t.write) spendWrite(t.money ? 'dinero' : 'datos')
          return formatear(await t.handler(args ?? {}))
        } catch (e) {
          // Un error de negocio es información útil para el agente, no una caída:
          // se devuelve como contenido para que reintente con otros argumentos.
          const msg = e instanceof KetzalError ? e.message : 'No se pudo completar la operación.'
          if (!(e instanceof KetzalError)) log('fallo en', t.name, (e as Error)?.message ?? e)
          return { ...formatear(`Error: ${msg}`), isError: true }
        }
      },
    )
  }
  return n
}
