/**
 * Mensaje seguro para el cliente a partir de un error de Supabase/Postgres.
 *
 * Los RPCs de negocio lanzan sus errores con `raise exception 'msg'`, que en
 * Postgres es SQLSTATE `P0001`: ese mensaje es autoral y está pensado para el
 * usuario ("No hay cupo", "Solo el superadmin…") → se muestra tal cual.
 *
 * Cualquier otro código (constraint 23xxx, permiso 42501, tipo 22xxx, RLS…) es
 * un detalle interno: se registra en el servidor (logs de Vercel) y al cliente
 * solo le llega el mensaje genérico. Así no filtramos nombres de columnas,
 * constraints ni políticas.
 *
 * ponytail: P0001 nunca lo produce el motor por sí mismo; solo un RAISE del código.
 */
export function safeError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  fallback = 'No se pudo completar la acción. Intenta de nuevo.',
): string {
  if (!error) return fallback
  if (error.code === 'P0001' && error.message) return error.message
  console.error('[action]', error.code ?? '?', error.message ?? '')
  return fallback
}
