import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

// Registra un evento de salud del sistema en ketzal.system_log (solo lo escribe
// el RPC DEFINER `log_sistema`, granted a service_role). `log_sistema` no está en
// los tipos generados a mano (otro flujo edita database.types.ts) → cast puntual.
export async function logSistema(
  sb: ServiceClient,
  source: 'clawbot_tick' | 'mp_webhook' | 'invariantes',
  level: 'info' | 'warn' | 'error' | 'critical',
  event: string,
  detail?: unknown
): Promise<void> {
  await sb.rpc('log_sistema' as never, {
    p_source: source,
    p_level: level,
    p_event: event,
    p_detail: detail ?? null,
  } as never)
}
