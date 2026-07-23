'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
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
    return { error: safeError(error) }
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
    return { error: safeError(error) }
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
    return { error: safeError(error) }
  }

  revalidatePath('/equipo')
  return { ok: true }
}

/**
 * Superadmin: fija una nueva contraseña para un agente del equipo.
 *
 * auth.users no lo cubre la RLS de Ketzal, así que va por SERVICE ROLE
 * (bypassa RLS) — y por eso el gate de superadmin se verifica AQUÍ antes de
 * usar el cliente de servicio, mismo criterio que /viajeros. El agente puede
 * entrar de inmediato con la nueva clave; si quiere, la cambia luego él mismo.
 */
export async function resetearPassword(
  userId: string,
  newPassword: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate: solo superadmin (leer el rol propio sí lo permite la RLS de profiles).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') {
    return { error: 'Solo el superadmin puede resetear contraseñas.' }
  }

  const pwd = (newPassword ?? '').trim()
  if (pwd.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const svc = createServiceClient()
  const { error } = await svc.auth.admin.updateUserById(userId, { password: pwd })
  if (error) {
    return { error: safeError(error, 'No se pudo actualizar la contraseña.') }
  }

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
    return { error: safeError(error) }
  }

  revalidatePath('/equipo')
  return { ok: true }
}
