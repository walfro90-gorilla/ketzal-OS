'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  if (error) return { error: error.message }

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
  if (error) return { error: error.message }

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
  if (error) return { error: error.message }

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
  if (error) return { error: error.message }

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
    return { error: rpcError?.message ?? 'No se pudo iniciar el cobro.' }
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
      back_urls: {
        success: `${origin}/ventas/${bookingId}?pago=ok`,
        failure: `${origin}/ventas/${bookingId}?pago=error`,
        pending: `${origin}/ventas/${bookingId}?pago=pendiente`,
      },
      auto_return: 'approved',
    }),
  })
  if (!res.ok) {
    return { error: 'Mercado Pago rechazó la solicitud. Revisa las credenciales.' }
  }
  const pref = (await res.json()) as { init_point?: string }
  if (!pref.init_point) {
    return { error: 'Mercado Pago no devolvió un link de pago.' }
  }

  return { url: pref.init_point }
}
