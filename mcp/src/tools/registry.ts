/**
 * Contrato de las herramientas.
 *
 * Cada archivo de dominio exporta un `ToolDef[]` y no sabe nada de MCP: devuelve
 * un valor plano y aquí se formatea, se anota y se le pone el freno de escritura.
 * Así los dominios se pueden escribir en paralelo sin tocarse entre ellos.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { READ_ONLY } from '../config.js'
import { KetzalError } from '../errors.js'
import { requireConfirm, spendWrite } from '../guard.js'
import { log } from '../log.js'

export type ToolDef = {
  /** Nombre expuesto al agente. Convención: `ketzal_<dominio>`. */
  name: string
  title: string
  /** Qué hace y CUÁNDO usarla. El agente elige por esto: sé concreto. */
  description: string
  inputSchema?: z.ZodObject<z.ZodRawShape>
  /** Escribe en la BD: se oculta con `--read-only` y consume cupo. */
  write?: boolean
  /** Mueve dinero: además de `write`, exige `confirmar: true` en los argumentos. */
  money?: boolean
  /**
   * Borra datos o los expone a terceros anónimos, sin mover dinero.
   * Sólo afecta la anotación `destructiveHint` que ven los clientes MCP para
   * decidir si auto-aprueban: no es un control de seguridad (la frontera real
   * son la RLS y los guards en SQL), pero anotar un DELETE como inofensivo sí
   * es engañar al cliente.
   */
  destructive?: boolean
  /** Repetirla no produce un efecto nuevo (emitir recibo, emitir voucher). */
  idempotent?: boolean
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

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
