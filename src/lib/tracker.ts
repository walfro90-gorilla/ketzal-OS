import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registra un evento en la bitácora de usuarios (b066).
 *
 * Best-effort a propósito: si la bitácora falla, la operación de negocio NO se
 * cae. Una auditoría que puede tumbar un cambio de rol se acaba quitando.
 *
 * El guard vive en el RPC (`log_user_event`): sólo se puede registrar sobre uno
 * mismo, sobre alguien de tu agencia si eres su admin, o sobre cualquiera si
 * eres superadmin. Aquí no se valida nada.
 */
export type EventoUsuario =
  | 'signup'
  | 'login'
  | 'logout'
  | 'password_reset_request'
  | 'password_changed'
  | 'role_change'
  | 'agency_change'
  | 'activated'
  | 'deactivated'
  | 'invited'
  | 'invitation_accepted'
  | 'join_request'
  | 'join_resolved'
  | 'profile_updated'
  | 'deleted'
  | 'nota'

export async function registrarEvento(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  kind: EventoUsuario,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    // RPC nuevo ⇒ cast (convención del repo: no se toca database.types.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('log_user_event', {
      p_user: userId,
      p_kind: kind,
      p_meta: meta,
    })
  } catch {
    // Silencio deliberado: ver arriba.
  }
}
