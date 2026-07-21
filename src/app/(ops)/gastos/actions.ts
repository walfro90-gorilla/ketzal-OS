'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { CATEGORIAS, type GastoInput } from './constants'

// Gastos (F2). El dinero vive en RPCs de Postgres (ledger append-only): estas
// acciones solo validan UX y llaman al RPC. Los RPCs no están en los types
// generados ⇒ cast `as never`. Las constantes/tipos viven en ./constants
// (este módulo es 'use server': solo puede exportar funciones async).

export async function crearGasto(
  input: GastoInput
): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const concept = input.concept?.trim()
  if (!concept) return { error: 'Escribe el concepto del gasto.' }
  if (!(CATEGORIAS as readonly string[]).includes(input.category)) {
    return { error: 'Selecciona una categoría válida.' }
  }
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'El monto debe ser mayor que cero.' }
  }
  if (input.category === 'mayorista' && !input.provider_supplier_id) {
    return { error: 'Un pago a mayorista requiere elegir el proveedor.' }
  }

  const { error } = await supabase.rpc('create_expense' as never, {
    p_concept: concept,
    p_category: input.category,
    p_amount: amount,
    p_method: input.method?.trim() || null,
    p_spent_at: input.spent_at,
    p_provider_supplier_id: input.provider_supplier_id || null,
    p_booking_id: input.booking_id || null,
    p_notes: input.notes?.trim() || null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar el gasto.') }

  revalidatePath('/gastos')
  revalidatePath('/reportes')
  redirect('/gastos?ok=gasto-registrado')
}

export async function revertirGasto(
  id: string,
  reason: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('reverse_expense' as never, {
    p_expense_id: id,
    p_reason: reason?.trim() || 'sin motivo',
  } as never)
  if (error) return { error: safeError(error, 'No se pudo revertir el gasto.') }

  revalidatePath('/gastos')
  revalidatePath('/reportes')
  return { ok: true }
}
