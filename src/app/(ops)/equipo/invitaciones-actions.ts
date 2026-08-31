'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { emitirCredencialProvisional, nuevaProvisional } from '@/lib/auth/credenciales'
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
  //
  // OJO — ESTE LINK ESTÁ ROTO, por la misma causa que mató al de embajadores y
  // proveedores (ADR-0027): un link hecho por la Admin API no trae
  // `code_verifier`, así que Auth cae a flujo implícito y `/auth/callback`
  // recibe la sesión en el FRAGMENTO (`#access_token=…`), que nunca llega al
  // servidor. Medido el 2026-08-31 con `type:'recovery'`: 303 a
  // `/auth/callback?next=…` con `fragment=[access_token,refresh_token,…]` y cero
  // `?code=`. El correo de `inviteUserByEmail` tiene el mismo problema.
  //
  // NO se arregló aquí con contraseña provisional, como sí se hizo en las otras
  // tres altas, porque este camino invita a una cuenta que TODAVÍA NO TIENE
  // `profiles`: el profile y el auto-join a la agencia los crea
  // `accept_pending_invitation` desde `/auth/callback`, y un login por
  // contraseña no pasa por ahí. Cambiarlo obliga a crear el profile por
  // adelantado con su rol y agencia —como ya hace `crearAgenciaEInvitarAdmin`—
  // y eso toca la máquina de estados de invitaciones. Carril aparte.
  //
  // Mientras tanto lo que SÍ funciona para dar de alta a un agente es crear la
  // agencia con su admin (`crearAgenciaEInvitarAdmin`) o, si ya existe la
  // cuenta, "Regenerar acceso" desde la fila del miembro.
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
  | {
      ok: true
      warning?: string
      credentials?: { email: string; password: string }
      existingUser?: boolean
    }
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

  // 2) Cuenta del admin. Caso normal: se CREA con una CONTRASEÑA PROVISIONAL
  //    (correo confirmado) y al primer login se le fuerza a crear la suya
  //    (must_change_password). Caso reutilización: si el correo YA tiene cuenta,
  //    se ENGANCHA esa cuenta como admin (entra con su contraseña actual). Cero
  //    dependencia de correo: el superadmin pasa las credenciales por WhatsApp.
  const provisional = nuevaProvisional()
  const svc = createServiceClient()
  let adminId: string
  let credentials: { email: string; password: string } | undefined
  let existingUser = false

  const { data: created } = await svc.auth.admin.createUser({
    email: adminEmail,
    password: provisional,
    email_confirm: true,
  })
  if (created?.user) {
    adminId = created.user.id
    credentials = { email: adminEmail, password: provisional }
  } else {
    // El correo ya existe (u otro error): buscar la cuenta y reutilizarla.
    const { data: foundId } = await svc.rpc('find_auth_user_id' as never, {
      p_email: adminEmail,
    } as never)
    if (!foundId) {
      revalidatePath('/equipo')
      return {
        ok: true,
        warning:
          'Agencia creada, pero no se pudo preparar la cuenta del admin. Dale acceso desde "Invitar agentes".',
      }
    }
    adminId = foundId as unknown as string
    existingUser = true
    // Solo se reutiliza una cuenta LIBRE: huérfana (sin profile) o un agente sin
    // agencia. Se BLOQUEA si el correo ya es de otra persona —superadmin, otra
    // agencia, viajero, embajador o proveedor— para NO convertir su tipo ni robar
    // su cuenta (un viajero es cliente; un embajador es un payee de comisión).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (svc as any)
      .from('profiles')
      .select('role, supplier_id, type')
      .eq('id', adminId)
      .maybeSingle()
    let motivo: string | null = null
    if (prof) {
      if (prof.role === 'superadmin') motivo = 'es del superadmin'
      else if (prof.type === 'viajero') motivo = 'es de un viajero (cliente)'
      else if (prof.type === 'embajador') motivo = 'es de un embajador'
      else if (prof.type === 'proveedor') motivo = 'es de un proveedor'
      else if (prof.supplier_id && prof.supplier_id !== supplierId)
        motivo = 'ya pertenece a otra agencia'
    }
    if (motivo) {
      // Deshacer la agencia recién creada para poder reintentar limpio.
      await svc.from('suppliers').delete().eq('id', supplierId)
      return { error: `Ese correo ${motivo}; usa otro para el admin de la agencia.` }
    }
  }

  // Profile como admin de la agencia. Si creé la cuenta, forzar cambio de
  // contraseña; si la reutilicé, no (entra con la suya).
  const profileRow: Record<string, unknown> = {
    id: adminId,
    email: adminEmail,
    type: 'agente',
    role: 'admin',
    active: true,
    supplier_id: supplierId,
  }
  if (!existingUser) {
    profileRow.name = adminEmail.split('@')[0]
    profileRow.must_change_password = true
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eProf } = await (svc as any).from('profiles').upsert(profileRow)
  if (eProf) {
    if (!existingUser) await svc.auth.admin.deleteUser(adminId) // rollback solo si YO la creé
    await svc.from('suppliers').delete().eq('id', supplierId)
    return {
      error: `No se pudo preparar la cuenta del admin: ${safeError(eProf)}`,
    }
  }

  revalidatePath('/equipo')
  return existingUser
    ? { ok: true, existingUser: true }
    : { ok: true, credentials }
}

/**
 * Superadmin: regenera el acceso de un miembro que perdió sus credenciales.
 * La contraseña provisional NO se puede recuperar (se guarda hasheada en
 * auth.users), así que se genera una NUEVA, se fuerza a crear la suya al primer
 * login (must_change_password) y se devuelve para copiarla y mandarla por
 * WhatsApp. Sirve igual si nunca entró o si olvidó la suya. Va por SERVICE ROLE
 * (auth.users no lo cubre la RLS de Ketzal), con el gate de superadmin aquí.
 */
export async function regenerarAcceso(
  userId: string
): Promise<
  { error: string } | { ok: true; credentials: { email: string; password: string } }
> {
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
    return { error: 'Solo el superadmin puede regenerar accesos.' }
  }

  const res = await emitirCredencialProvisional(userId)
  return 'error' in res ? res : { ok: true, credentials: res.credentials }
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
