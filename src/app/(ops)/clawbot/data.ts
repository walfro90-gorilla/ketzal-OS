import { createClient } from '@/lib/supabase/server'

// Tipos del outbox de Clawbot (forma del jsonb que devuelven los RPCs).
// Nota: los RPCs `clawbot_*` aún no están en los tipos generados a mano
// (otro flujo edita database.types.ts en paralelo); cast puntual del nombre,
// mismo patrón que src/app/(ops)/cobranza/data.ts.

export type ClawbotKind =
  | 'abono_por_vencer'
  | 'abono_vencido'
  | 'cotizacion_seguimiento'
  | 'viaje_proximo'
  // F7 — reglas operativas (clawbot_reglas_operativas):
  | 'saldo_sin_plan'
  | 'viaje_manana_operativo'
  | 'pago_sin_recibo'

export type ClawbotReminder = {
  id: string
  kind: ClawbotKind
  title: string
  message: string
  phone: string | null
  booking_id: string | null
  cliente: string | null
  servicio: string | null
  created_at: string
}

export type ClawbotResumen = {
  total: number
  abono_vencido: number
  abono_por_vencer: number
  cotizacion_seguimiento: number
  viaje_proximo: number
}

const EMPTY_RESUMEN: ClawbotResumen = {
  total: 0,
  abono_vencido: 0,
  abono_por_vencer: 0,
  cotizacion_seguimiento: 0,
  viaje_proximo: 0,
}

/** Bandeja del agente: recordatorios pendientes (RLS), ya ordenados por urgencia. */
export async function getBandeja(): Promise<ClawbotReminder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('clawbot_bandeja' as never)
  if (error || data == null) return []
  return data as unknown as ClawbotReminder[]
}

/** Conteo de pendientes por tipo; lo usa también el digest del Panel. */
export async function getClawbotResumen(): Promise<ClawbotResumen> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('clawbot_resumen' as never)
  if (error || data == null) return EMPTY_RESUMEN
  return data as unknown as ClawbotResumen
}
