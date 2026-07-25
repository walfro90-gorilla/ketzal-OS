'use server'

import { randomInt } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

/**
 * Genera el acceso de un invitado: (1) manda un correo para que cree su contraseña
 * —solo llega de verdad si hay SMTP propio en Supabase Auth— y (2) devuelve un link
 * copiable para mandar por WhatsApp. Ambos llevan a /nueva-password; al abrirlo se
 * crea el profile y se auto-une a su agencia. Solo superadmin (MVP).
 */
export async function generarLinkInvitacion(
  email: string
): Promise<{ error: string } | { link: string; emailed: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') {
    return { error: 'Solo el superadmin puede generar accesos.' }
  }

  const correo = (email ?? '').trim().toLowerCase()
  if (!correo) return { error: 'Falta el correo.' }

  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`
  const redirectTo = `${origin}/auth/callback?next=/nueva-password`
  const svc = createServiceClient()

  // 1) Invitar por correo: crea la cuenta y manda el email "crea tu contraseña".
  //    Sin SMTP propio en Supabase el correo casi no llega (por eso el link de abajo).
  //    Si la cuenta ya existe, inviteUserByEmail falla ⇒ lo ignoramos (usamos el link).
  let emailed = false
  const inv = await svc.auth.admin.inviteUserByEmail(correo, { redirectTo })
  if (!inv.error) emailed = true

  // 2) Link copiable (WhatsApp): recovery = "pon tu contraseña". No depende del correo.
  const { data, error } = await svc.auth.admin.generateLink({
    type: 'recovery',
    email: correo,
    options: { redirectTo },
  })
  const link = data?.properties?.action_link
  if (!link) {
    return emailed
      ? { link: '', emailed }
      : { error: safeError(error, 'No se pudo generar el link de acceso.') }
  }
  return { link, emailed }
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
}): Promise<
  | { error: string }
  | { ok: true; warning?: string; credentials?: { email: string; password: string } }
> {
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
    // `suppliers` tiene UNIQUE en `name` Y en `contact_email`. Un 23505 puede venir
    // de cualquiera de las dos ⇒ inspeccionar el detalle del error para dar el
    // mensaje correcto (antes se culpaba siempre al correo, confundiendo cuando el
    // choque era el nombre).
    if (eSup?.code === '23505') {
      const detalle = `${eSup.message ?? ''} ${
        (eSup as { details?: string | null }).details ?? ''
      }`
      if (detalle.includes('contact_email')) {
        return {
          error: `Ya existe una agencia o proveedor con el correo de contacto "${contacto}". Captura un correo de contacto distinto para la agencia (o cambia el correo del admin).`,
        }
      }
      if (detalle.includes('name')) {
        return {
          error: `Ya existe una agencia o proveedor con el nombre "${nombre}". Usa un nombre distinto.`,
        }
      }
      return {
        error: 'Ya existe una agencia o proveedor con esos datos (nombre o correo repetido).',
      }
    }
    return { error: safeError(eSup, 'No se pudo crear la agencia.') }
  }
  const supplierId = (sup as { id: string }).id

  // 2) Crear la cuenta del admin con una CONTRASEÑA PROVISIONAL (correo ya
  //    confirmado para que entre de una) + su profile como admin de la agencia.
  //    Al primer login se le fuerza a crear su propia contraseña
  //    (must_change_password). Cero dependencia de correo: el superadmin le pasa
  //    las credenciales por WhatsApp.
  const provisional = `Ketzal-${randomInt(100000, 999999)}`
  const svc = createServiceClient()
  const { data: created, error: eUser } = await svc.auth.admin.createUser({
    email: adminEmail,
    password: provisional,
    email_confirm: true,
  })
  if (eUser || !created?.user) {
    revalidatePath('/equipo')
    return {
      ok: true,
      warning: `Agencia creada, pero no se pudo crear la cuenta del admin (${safeError(
        eUser,
        '¿ese correo ya tiene cuenta en Ketzal?'
      )}). Usa otro correo, o dale acceso desde "Invitar agentes".`,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eProf } = await (svc as any).from('profiles').upsert({
    id: created.user.id,
    email: adminEmail,
    name: adminEmail.split('@')[0],
    type: 'agente',
    role: 'admin',
    active: true,
    supplier_id: supplierId,
    must_change_password: true,
  })
  if (eProf) {
    // Deshacer la cuenta auth para no dejar un huérfano sin profile.
    await svc.auth.admin.deleteUser(created.user.id)
    revalidatePath('/equipo')
    return {
      ok: true,
      warning: `Agencia creada, pero no se pudo preparar la cuenta del admin (${safeError(
        eProf
      )}). Dale acceso desde "Invitar agentes".`,
    }
  }

  revalidatePath('/equipo')
  return { ok: true, credentials: { email: adminEmail, password: provisional } }
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
