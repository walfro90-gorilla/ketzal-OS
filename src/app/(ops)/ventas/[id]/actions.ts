'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

export type RegistrarAbonoInput = {
  amount: number
  method: string
  date: string
  type: 'payment' | 'refund'
}

export async function registrarAbono(
  bookingId: string,
  input: RegistrarAbonoInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Defensa de UX; la autoridad final es el RPC (valida venta, RLS y estado).
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'El monto debe ser un número mayor que 0.' }
  }
  if (input.type !== 'payment' && input.type !== 'refund') {
    return { error: 'El tipo de movimiento no es válido.' }
  }

  const { error } = await supabase.rpc('register_payment', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_method: input.method?.trim() || null,
    // Mediodía local: evita que la fecha "retroceda" un día al convertir a UTC.
    p_paid_at: input.date ? new Date(input.date + 'T12:00:00').toISOString() : null,
    p_type: input.type,
  })
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  // El saldo puede cambiar el estado de la venta (paid/reserved) que se ve en la lista.
  revalidatePath('/ventas')
  return { ok: true }
}

export async function emitirRecibo(
  bookingId: string,
  paymentId: string
): Promise<{ error: string } | { ok: true; folio: number }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('emit_receipt', {
    p_payment_id: paymentId,
  })
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  return { ok: true, folio: Number(data) }
}

export async function actualizarVencimiento(
  bookingId: string,
  dueDate: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('bookings')
    .update({ due_date: dueDate || null })
    .eq('id', bookingId)
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  // El vencimiento alimenta el KPI "Vencido" y la tabla "Por cobrar" del panel.
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function cancelarVenta(
  bookingId: string,
  reason: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El RPC valida estado (falla si no existe o ya está cancelada) y respeta RLS.
  // No borra pagos: el ledger es append-only.
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason,
  })
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  revalidatePath('/ventas')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Cobro en línea con Mercado Pago: crea un intento + una preferencia de Checkout
 * Pro y devuelve el link de pago. El webhook (/api/mp/webhook) confirma y registra
 * el abono automáticamente. Requiere MP_ACCESS_TOKEN (env).
 */
export async function crearLinkPago(
  bookingId: string,
  amount: number
): Promise<{ error: string } | { url: string }> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) {
    return { error: 'Los pagos en línea aún no están configurados (falta MP_ACCESS_TOKEN).' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const monto = Number(amount)
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto debe ser un número mayor que 0.' }
  }

  // 1. Intento de pago (RLS valida acceso a la venta + cuenta activa).
  const { data: intentId, error: rpcError } = await supabase.rpc('create_payment_intent', {
    p_booking_id: bookingId,
    p_amount: monto,
  })
  if (rpcError || !intentId) {
    return { error: safeError(rpcError, 'No se pudo iniciar el cobro.') }
  }

  // 2. Origen para back_urls y el webhook.
  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`

  // 3. Preferencia de Checkout Pro en Mercado Pago.
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [
        {
          title: `Abono venta ${bookingId.slice(0, 8)}`,
          quantity: 1,
          unit_price: monto,
          currency_id: 'MXN',
        },
      ],
      external_reference: intentId as string,
      notification_url: `${origin}/api/mp/webhook`,
      // Sin `auto_return` y sin query-strings en back_urls: la combinación de
      // auto_return + params en success URL es la causa #1 del "algo salió mal"
      // (pantalla /fatal/) en el checkout sandbox de MP. El webhook (notification_url)
      // registra el abono igual; back_urls es solo el regreso visual.
      back_urls: {
        success: `${origin}/ventas/${bookingId}`,
        failure: `${origin}/ventas/${bookingId}`,
        pending: `${origin}/ventas/${bookingId}`,
      },
    }),
  })
  if (!res.ok) {
    return { error: 'Mercado Pago rechazó la solicitud. Revisa las credenciales.' }
  }
  const pref = (await res.json()) as { id?: string; init_point?: string }
  if (!pref.init_point) {
    return { error: 'Mercado Pago no devolvió un link de pago.' }
  }

  // Guarda el preference id en el intento para reconciliar el pago después
  // (RLS payment_intents_upd: created_by = auth.uid() lo permite). No es crítico
  // si falla — el webhook correlaciona por external_reference, no por esto.
  // `payment_intents` no está en database.types.ts (lo mantiene otro agente):
  // cast puntual `as never`, igual que los RPCs nuevos, para no tocar los tipos.
  if (pref.id) {
    await supabase
      .from('payment_intents' as never)
      .update({ mp_preference_id: pref.id } as never)
      .eq('id', intentId as string)
  }

  return { url: pref.init_point }
}

/**
 * Estado de cuenta del cliente: genera (o reutiliza) el token público de la venta
 * y devuelve el link compartible (/estado/[token]). El agente lo comparte por
 * WhatsApp; el cliente ve total, abonos y saldo sin necesitar cuenta. El RPC es
 * SECURITY INVOKER: si la venta no es del agente/su agencia, devuelve null.
 */
export async function compartirEstadoCuenta(
  bookingId: string
): Promise<{ error: string } | { url: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: token, error } = await supabase.rpc('ensure_statement_token', {
    p_booking_id: bookingId,
  })
  if (error) return { error: safeError(error) }
  if (!token) return { error: 'No se pudo generar el estado de cuenta de esta venta.' }

  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`
  return { url: `${origin}/estado/${token}` }
}

// ── Plan de pagos (abonos) ───────────────────────────────────────────────
export type FrecuenciaPlan = 'semanal' | 'quincenal' | 'mensual'

/** Vista previa del calendario SIN persistir (para el formulario). */
export async function previewPlanPagos(
  total: number,
  finalDate: string,
  frequency: FrecuenciaPlan,
  downPct: number
): Promise<{ error: string } | { plan: unknown }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('preview_payment_plan', {
    p_total: total,
    p_final: finalDate,
    p_frequency: frequency,
    p_down_pct: downPct,
  })
  if (error) return { error: safeError(error) }
  return { plan: data }
}

/** Genera y persiste el plan (enganche % + abonos por frecuencia hasta la fecha final). */
export async function crearPlanPagos(
  bookingId: string,
  frequency: FrecuenciaPlan,
  finalDate: string | null,
  downPct: number
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('generate_payment_plan', {
    p_booking_id: bookingId,
    p_frequency: frequency,
    p_final_date: finalDate,
    p_down_pct: downPct,
  })
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  return { ok: true }
}

/** Quita el plan y regresa la venta a "contado". */
export async function quitarPlanPagos(
  bookingId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('clear_payment_plan', {
    p_booking_id: bookingId,
  })
  if (error) return { error: safeError(error) }

  revalidatePath('/ventas/' + bookingId)
  return { ok: true }
}

// La agencia califica al viajero (marketplace, post-viaje). RPC submit_rating
// valida que sea la agencia vendedora + viaje completado.
export async function calificarViajero(
  bookingId: string,
  rating: number,
  comment?: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('submit_rating' as never, {
    p_booking_id: bookingId,
    p_kind: 'provider_to_traveler',
    p_rating: rating,
    p_comment: comment ?? null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo calificar al viajero.') }

  revalidatePath('/ventas/' + bookingId)
  return { ok: true }
}

// Devolución REAL por Mercado Pago: devuelve el dinero a la tarjeta del comprador
// (API refund de MP) y registra el asiento de reembolso en el ledger. v1: total.
// Orden importa: primero MP (mueve el dinero), luego el ledger; si el ledger falla
// tras un refund MP exitoso, se reporta para reconciliación manual (no se pierde
// el registro del movimiento — el dinero ya salió de MP).
// Devuelve UN pago específico. Si fue por Mercado Pago, primero regresa el dinero a
// la tarjeta (API refund de MP), luego registra el asiento ligado (refund_payment).
// Si fue efectivo/transferencia, solo registra el asiento (el dinero se devuelve a
// mano). Orden MP→ledger; si el ledger falla tras un refund MP OK, se reporta.
export async function reembolsarPago(
  paymentId: string
): Promise<{ error: string } | { ok: true; refunded: number }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El pago a devolver (RLS: solo tus ventas). `transaction_id` no está en
  // database.types.ts (tipos a mano) ⇒ cast del select, como el resto del repo.
  const { data: payRaw } = await supabase
    .from('payments')
    .select(
      'id, booking_id, amount_mxn, transaction_id, type, status, payment_method' as '*'
    )
    .eq('id', paymentId)
    .maybeSingle()
  const pay = payRaw as unknown as {
    id: string
    booking_id: string
    amount_mxn: number | string
    transaction_id: string | null
    type: string
    status: string
    payment_method: string | null
  } | null
  if (!pay) return { error: 'Pago no encontrado o sin acceso.' }
  if (pay.type !== 'payment' || pay.status !== 'COMPLETED') {
    return { error: 'Ese movimiento no es un pago reembolsable.' }
  }

  const esMP = pay.payment_method === 'mercadopago'

  // Pago MP: devolución real en la tarjeta antes de tocar el ledger.
  if (esMP) {
    const token = process.env.MP_ACCESS_TOKEN
    if (!token) return { error: 'Mercado Pago no está configurado.' }
    if (!pay.transaction_id) {
      return { error: 'El pago no tiene referencia de Mercado Pago.' }
    }
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${pay.transaction_id}/refunds`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': `refund-${pay.id}`,
        },
        body: JSON.stringify({}),
      }
    )
    if (!res.ok) {
      return {
        error:
          'Mercado Pago rechazó el reembolso. Reintenta o revisa en el panel de MP.',
      }
    }
  }

  // Asiento de reembolso ligado al pago (guards en el RPC). Para efectivo, esto es
  // todo: el dinero se devuelve a mano y aquí queda el registro.
  const { data, error } = await supabase.rpc('refund_payment' as never, {
    p_payment_id: paymentId,
  } as never)
  if (error) {
    const extra = esMP
      ? ' El dinero SÍ se devolvió en Mercado Pago; reconciliar el ledger manualmente.'
      : ''
    return { error: `No se pudo registrar el reembolso (${safeError(error)}).${extra}` }
  }

  revalidatePath('/ventas/' + pay.booking_id)
  revalidatePath('/ventas')
  return { ok: true, refunded: Number(data) }
}
