'use server'

import { revalidatePath } from 'next/cache'
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
