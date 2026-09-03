/**
 * El contrato de una herramienta, sin nada de MCP.
 *
 * Vive aparte de `registry.ts` a propósito: ahí se importa el tipo `McpServer`
 * del SDK, y quien solo quiere EJECUTAR las herramientas —el asistente del OS,
 * que las corre en-proceso (ADR-0044)— no tiene por qué arrastrar el SDK a su
 * programa de tipos. Sin esta separación, `tsc` de la app falla con
 * "Cannot find module '@modelcontextprotocol/server'".
 */
import type { z } from 'zod'

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
