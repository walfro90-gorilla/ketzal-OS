'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// F5: fijar/quitar meta del MES ACTUAL (agente o agencia). El guard de admin y
// el scope de agencia viven en los RPCs DEFINER (upsert/delete_sales_goal).

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function fijarMeta(
  agentId: string | null,
  amount: number
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'La meta debe ser mayor que cero.' }
  }
  const { error } = await supabase.rpc('upsert_sales_goal' as never, {
    p_agent: agentId,
    p_month: currentMonth(),
    p_amount: amount,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo guardar la meta.') }
  revalidatePath('/equipo')
  revalidatePath('/reportes')
  return { ok: true }
}

export async function quitarMeta(
  agentId: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  const { error } = await supabase.rpc('delete_sales_goal' as never, {
    p_agent: agentId,
    p_month: currentMonth(),
  } as never)
  if (error) return { error: safeError(error, 'No se pudo quitar la meta.') }
  revalidatePath('/equipo')
  revalidatePath('/reportes')
  return { ok: true }
}
