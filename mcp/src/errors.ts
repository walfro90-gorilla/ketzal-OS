/**
 * Contrato de errores — calco de `src/lib/errors.ts` de la app.
 *
 * Los RPCs de negocio lanzan sus errores con `raise exception 'msg'`, que en
 * Postgres es SQLSTATE `P0001`: ese mensaje es autoral y está escrito para que lo
 * lea una persona ("No hay cupo", "Solo el superadmin…"). Es exactamente lo que un
 * agente necesita para corregirse, así que se devuelve tal cual.
 *
 * Cualquier otro código (constraint 23xxx, permiso 42501, RLS) es detalle interno:
 * va a stderr y al agente le llega una categoría corta, sin nombres de columnas,
 * constraints ni policies.
 */
import { log } from './log.js'

export type PgError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const CATEGORIAS: Record<string, string> = {
  '42501': 'Sin permiso para esta operación con tu cuenta.',
  '42883': 'Esa operación no existe en el servidor (puede que tu ketzal-mcp esté viejo).',
  PGRST202: 'Esa operación no existe en el servidor (puede que tu ketzal-mcp esté viejo).',
  PGRST301: 'Tu sesión no es válida. Corre `npx ketzal-mcp login`.',
}

export function safeError(
  err: PgError | null | undefined,
  fallback = 'No se pudo completar la operación.',
): string {
  if (!err) return fallback
  const code = err.code ?? ''
  if (code === 'P0001' && err.message) return err.message

  log('error', code || '?', err.message ?? '')
  if (CATEGORIAS[code]) return CATEGORIAS[code]!
  if (code.startsWith('23')) return 'Los datos no cumplen una restricción de la base de datos.'
  if (code.startsWith('22')) return 'Algún dato tiene el tipo o el formato equivocado.'
  return fallback
}

/** Error ya listo para devolverle al agente (mensaje seguro, sin stack). */
export class KetzalError extends Error {}
