'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import type { Database } from '@/lib/db/database.types'

type UserRole = Database['ketzal']['Enums']['user_role']
type ActionResult = { error: string } | { ok: true }

// P2 (SaaS delegado): las agencias se gestionan solas. El guard real (superadmin
// vs admin de la propia agencia, nunca cross-agencia ni superadmin) vive en los
// RPCs DEFINER invite_agent / revoke_invitation / set_agency_member_role. RPCs
// nuevos ⇒ cast `as never` (convención del repo, sin tocar database.types.ts).

/**
 * Invita a un agente por correo. El admin de agencia solo puede invitar a la
 * suya (supplierId se ignora/valida en el RPC); el superadmin debe indicar la
 * agencia destino. Rol permitido: user (agente) o admin. Al primer login del
 * invitado (email verificado) se auto-une a esa agencia con el rol invitado.
 */
export async function invitarAgente(
  email: string,
  role: UserRole,
  supplierId?: string | null
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  const correo = (email ?? '').trim()
  if (!correo) return { error: 'Escribe un correo.' }
  if (role !== 'user' && role !== 'admin') {
    return { error: 'Rol inválido (solo Agente o Admin).' }
  }

  const { error } = await supabase.rpc('invite_agent' as never, {
    p_email: correo,
    p_role: role,
    p_supplier: supplierId ?? null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo enviar la invitación.') }

  revalidatePath('/equipo')
  return { ok: true }
}

/** Revoca una invitación pendiente (superadmin cualquiera; admin la de su agencia). */
export async function revocarInvitacion(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  const { error } = await supabase.rpc('revoke_invitation' as never, {
    p_id: id,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo revocar la invitación.') }

  revalidatePath('/equipo')
  return { ok: true }
}

/**
 * Superadmin: onboarding de una agencia en un solo paso — crea la agencia
 * (`suppliers` type='agency', RLS solo-superadmin) y de inmediato invita a su
 * admin (rol admin) a esa agencia recién creada. Si la agencia se crea pero la
 * invitación falla, no se revierte (la agencia ya existe y se puede invitar al
 * admin después desde "Invitar agentes"): se regresa como `warning`.
 */
export async function crearAgenciaEInvitarAdmin(input: {
  nombre: string
  adminEmail: string
  commissionRate?: number
  contactEmail?: string
}): Promise<{ error: string } | { ok: true; warning?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  // Gate superadmin (leer el rol propio sí lo permite la RLS de profiles). La
  // RLS de suppliers también lo exige; esto es solo para un mensaje claro.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') {
    return { error: 'Solo el superadmin puede crear agencias.' }
  }

  const nombre = (input.nombre ?? '').trim()
  if (!nombre) return { error: 'Escribe el nombre de la agencia.' }
  const adminEmail = (input.adminEmail ?? '').trim()
  if (!adminEmail) return { error: 'Escribe el correo del admin a invitar.' }
  const contacto = (input.contactEmail ?? '').trim() || adminEmail
  const rate = Number(input.commissionRate ?? 0)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: 'La comisión debe estar entre 0 y 100.' }
  }

  // 1) Crear la agencia (RLS: solo superadmin puede insertar de primer nivel).
  const { data: sup, error: eSup } = await supabase
    .from('suppliers')
    .insert({
      name: nombre,
      contact_email: contacto,
      supplier_type: 'agency',
      commission_rate: rate,
    } as never)
    .select('id')
    .single()
  if (eSup || !sup) {
    return { error: safeError(eSup, 'No se pudo crear la agencia.') }
  }
  const supplierId = (sup as { id: string }).id

  // 2) Invitar a su admin (rol admin) a la agencia recién creada.
  const { error: eInv } = await supabase.rpc('invite_agent' as never, {
    p_email: adminEmail,
    p_role: 'admin',
    p_supplier: supplierId,
  } as never)

  revalidatePath('/equipo')
  if (eInv) {
    return {
      ok: true,
      warning: `Agencia creada, pero no se pudo invitar al admin (${safeError(
        eInv
      )}). Invítalo desde "Invitar agentes".`,
    }
  }
  return { ok: true }
}

/**
 * Delega el rol de un miembro DENTRO de la agencia (user ↔ admin). Lo usa el
 * admin de agencia; el superadmin ya tiene el selector de 3 roles. El RPC impide
 * poner superadmin y tocar otra agencia.
 */
export async function cambiarRolAgencia(
  userId: string,
  role: UserRole
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  if (role !== 'user' && role !== 'admin') {
    return { error: 'Rol inválido (solo Agente o Admin).' }
  }

  const { error } = await supabase.rpc('set_agency_member_role' as never, {
    p_user: userId,
    p_role: role,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo cambiar el rol.') }

  revalidatePath('/equipo')
  return { ok: true }
}
