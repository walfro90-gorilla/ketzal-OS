'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// C4/C5 — Cancelar con política (b050) y aplicar crédito (b049). Archivo
// aparte de actions.ts (convención del carril). Todos los guards de dinero
// viven en los RPCs; aquí solo validación de UX.

export type PreviewCancelacion = {
  dias_antes?: number
  tramo_pct?: number
  pena_mxn?: number
  pagado_mxn: number
  efectivo?: { a_devolver_mxn: number }
  credito?: { monto_mxn: number; expira: string }
  es_snapshot: boolean
  aceptada: boolean
  cancelada: boolean
  sin_fecha?: boolean
}

export async function previewCancelacion(
  bookingId: string,
): Promise<{ error: string } | { preview: PreviewCancelacion }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('preview_cancellation' as never, {
    p_booking: bookingId,
  } as never)
  if (error || !data) {
    return { error: safeError(error, 'No se pudo calcular la cancelación.') }
  }
  return { preview: data as unknown as PreviewCancelacion }
}

export async function cancelarVentaV2(
  bookingId: string,
  reason: string,
  mode: 'efectivo' | 'credito',
  waiveFee: boolean,
): Promise<
  | { error: string }
  | { ok: true; penaMxn: number; aDevolverMxn: number; creditoMxn: number | null }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_booking_v2' as never, {
    p_booking: bookingId,
    p_reason: reason.trim() || null,
    p_mode: mode,
    p_waive_fee: waiveFee,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo cancelar la venta.') }
  const res = data as unknown as {
    pena_mxn: number
    a_devolver_mxn: number
    credito_mxn: number | null
  }
  revalidatePath('/ventas/' + bookingId)
  revalidatePath('/ventas')
  return {
    ok: true,
    penaMxn: Number(res.pena_mxn ?? 0),
    aDevolverMxn: Number(res.a_devolver_mxn ?? 0),
    creditoMxn: res.credito_mxn == null ? null : Number(res.credito_mxn),
  }
}

// Canje de crédito como abono de esta venta (método 'credito'). El RPC valida
// persona (mismo cliente o misma identidad marketplace — el crédito es
// UNIVERSAL en Ketzal), vigencia y saldos.
export async function aplicarCredito(
  bookingId: string,
  creditId: string,
  amount: number,
): Promise<{ error: string } | { ok: true; saldoCredito: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'El monto debe ser mayor que 0.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('redeem_credit' as never, {
    p_credit: creditId,
    p_booking: bookingId,
    p_amount: amount,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo aplicar el crédito.') }
  revalidatePath('/ventas/' + bookingId)
  revalidatePath('/ventas')
  return { ok: true, saldoCredito: Number(data) }
}
