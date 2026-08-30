'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { notificar, superadmins } from '@/lib/push/send'

// Alta de EMBAJADOR = profile(type='embajador') con su cuenta auth (profiles.id
// → auth.users ON DELETE CASCADE, F2). Va por SERVICE ROLE (crea la cuenta auth y
// escribe profiles pese al lockdown b017), con la puerta puesta AQUÍ porque el
// service role no respeta RLS.
//
// m005 — dos cambios para poder reclutar de verdad:
//   · El correo es OBLIGATORIO. Antes se sintetizaba `<uuid>@embajador.ketzal.local`
//     si venía vacío; ese dominio no existe, así que el magic-link de acceso se
//     generaba contra un buzón inalcanzable y la cuenta quedaba muerta sin aviso.
//   · Recluta el admin de agencia, no solo el superadmin — si no, cada embajador
//     nuevo pasa por el fundador.
//
// m008 — `supplier_id` dice QUIÉN LO RECLUTÓ, no a qué catálogo se limita:
//   · Ketzal recluta embajadores DIRECTOS, sin agencia (`supplier_id` null).
//   · Cualquier embajador vende viajes de CUALQUIER agencia. No hay límite.
//   · Cobra la tarifa que fijó la agencia dueña del viaje (ADR-0021).

/**
 * Puerta de alta de embajadores. Devuelve la agencia dueña: la del admin que
 * recluta, o la que el superadmin elija (él no tiene agencia propia).
 */
async function requireReclutador(
  supplierElegido?: string | null,
): Promise<{ ok: true; supplierId: string | null } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, supplier_id')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'superadmin') {
    // Sin agencia elegida = embajador DIRECTO de Ketzal (m008). No queda
    // huérfano: cobra la tarifa de la agencia dueña de cada viaje que traiga.
    return { ok: true, supplierId: supplierElegido || null }
  }
  if (profile?.role === 'admin' && profile.supplier_id) {
    return { ok: true, supplierId: profile.supplier_id }
  }
  return { error: 'Solo un administrador de agencia puede dar de alta embajadores.' }
}

/** Código de referido: mayúsculas, sin espacios; vacío ⇒ null. */
function normalizarReferral(v: string | null | undefined): string | null {
  const s = (v ?? '').toUpperCase().replace(/\s/g, '')
  return s === '' ? null : s
}

export async function crearEmbajador(input: {
  nombre: string
  codigo: string
  email?: string
  /** Solo lo usa el superadmin, que no tiene agencia propia. */
  supplierId?: string | null
}): Promise<{ error: string } | { ok: true }> {
  const gate = await requireReclutador(input.supplierId)
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  const codigo = normalizarReferral(input.codigo)
  if (!nombre) return { error: 'Escribe el nombre del embajador.' }
  if (!codigo) return { error: 'Escribe el código de referido (con él se atribuyen las ventas).' }

  // Correo real obligatorio: es el único camino de acceso del embajador (el
  // magic-link va ahí). Un correo inventado deja la cuenta muerta en silencio.
  const email = input.email?.trim().toLowerCase()
  if (!email) return { error: 'Escribe el correo del embajador: por ahí recibe su acceso.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ese correo no parece válido.' }
  }
  const svc = createServiceClient()
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: nombre },
  })
  if (authErr || !created?.user) {
    return {
      error: safeError(authErr, 'No se pudo crear la cuenta (¿correo ya registrado?).'),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rowErr } = await (svc as any).from('profiles').upsert({
    id: created.user.id,
    name: nombre,
    email,
    type: 'embajador',
    active: true,
    referral_code: codigo,
    supplier_id: gate.supplierId,
  })
  if (rowErr) {
    // Deshacer la cuenta auth para no dejar un huérfano sin profile.
    await svc.auth.admin.deleteUser(created.user.id)
    const dup =
      (rowErr as { code?: string }).code === '23505' &&
      String(rowErr.message ?? '').includes('referral_code')
    return {
      error: dup
        ? 'Ese código de referido ya está en uso.'
        : safeError(rowErr, 'No se pudo guardar el embajador.'),
    }
  }

  // b036: avisar a los superadmins — hay un embajador nuevo. Best-effort.
  try {
    await notificar(await superadmins(), {
      title: 'Embajador nuevo',
      body: `${nombre} se dio de alta con el código ${codigo}.`,
      url: '/comisiones',
    })
  } catch {
    /* best-effort */
  }

  revalidatePath('/comisiones')
  return { ok: true }
}
