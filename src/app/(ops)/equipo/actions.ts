'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/db/database.types'

type UserRole = Database['ketzal']['Enums']['user_role']

type ActionResult = { error: string } | { ok: true }

/** Aprueba (active=true) o desactiva (active=false) a un miembro del equipo. */
export async function aprobarUsuario(
  userId: string,
  active: boolean
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // La RPC valida permisos (admin de la agencia o superadmin).
  const { error } = await supabase.rpc('set_user_active', {
    p_user: userId,
    p_active: active,
  })
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipo')
  return { ok: true }
}

/** Asigna al miembro a una agencia, o null = agente libre de Ketzal. Solo superadmin. */
export async function asignarAgencia(
  userId: string,
  supplierId: string | null
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('assign_user_agency', {
    p_user: userId,
    p_supplier: supplierId,
  })
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipo')
  return { ok: true }
}

/** Cambia el rol del miembro. Solo superadmin. */
export async function cambiarRol(
  userId: string,
  role: UserRole
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('set_user_role', {
    p_user: userId,
    p_role: role,
  })
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipo')
  return { ok: true }
}

/** Guarda el % de comisión de plataforma (app_settings, fila única). Solo superadmin (RLS). */
export async function guardarTarifaPlataforma(
  rate: number
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: 'El porcentaje debe estar entre 0 y 100.' }
  }

  const { error } = await supabase
    .from('app_settings')
    .update({ platform_commission_rate: rate })
    .eq('id', 1)
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/equipo')
  return { ok: true }
}
