'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { notificar, superadmins } from '@/lib/push/send'
import { nuevaProvisional } from '@/lib/auth/credenciales'

// Alta de EMBAJADOR = profile(type='embajador') con su cuenta auth (profiles.id
// → auth.users ON DELETE CASCADE, F2). Va por SERVICE ROLE (crea la cuenta auth y
// escribe profiles pese al lockdown b017), con la puerta puesta AQUÍ porque el
// service role no respeta RLS.
//
// m005 — dos cambios para poder reclutar de verdad:
//   · El correo es OBLIGATORIO: es el usuario con el que entra. Antes se
//     sintetizaba `<uuid>@embajador.ketzal.local` si venía vacío, y esa cuenta
//     quedaba muerta sin aviso porque nadie podía escribirle ese correo.
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

/**
 * Alta de embajador. Devuelve la contraseña PROVISIONAL para que el reclutador
 * se la mande por WhatsApp o correo (el envío es manual: no hay emisor de correo
 * en el repo y la caja de WhatsApp está pausada). Se ve una sola vez; si se
 * pierde, `regenerarAccesoEmbajador` emite otra.
 *
 * Si el correo YA tiene cuenta de viajero, no se crea nada: se convierte esa
 * misma cuenta y devuelve `credentials: null` — entra con su contraseña de
 * siempre y conserva sus compras y créditos (b087, ADR-0033).
 */
export async function crearEmbajador(input: {
  nombre: string
  codigo: string
  email?: string
  /** Para mandarle el acceso por WhatsApp sin volver a teclear el número. */
  telefono?: string
  /** Solo lo usa el superadmin, que no tiene agencia propia. */
  supplierId?: string | null
  /**
   * Quién lo invitó (b085). Hecho relacional, no dinero: de aquí se DERIVA el
   * bono de $300 que gana el que invita cuando su invitado logra su primera
   * venta. No es multinivel — no gana nada más de las ventas de su recluta.
   */
  recruitedBy?: string | null
}): Promise<
  | { error: string }
  /** `credentials: null` = la cuenta ya existía y conserva su contraseña. */
  | {
      ok: true
      credentials: { email: string; password: string } | null
      telefono: string | null
    }
> {
  const gate = await requireReclutador(input.supplierId)
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  const codigo = normalizarReferral(input.codigo)
  if (!nombre) return { error: 'Escribe el nombre del embajador.' }
  if (!codigo) return { error: 'Escribe el código de referido (con él se atribuyen las ventas).' }

  // Correo real obligatorio: ES el usuario con el que entra. Uno inventado deja
  // la cuenta muerta en silencio.
  const email = input.email?.trim().toLowerCase()
  if (!email) return { error: 'Escribe el correo del embajador: por ahí recibe su acceso.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ese correo no parece válido.' }
  }
  const telefono = input.telefono?.trim() || null
  const svc = createServiceClient()

  // b087 — CONVERSIÓN. Antes, un correo que ya tenía cuenta reventaba en
  // `createUser` con "¿correo ya registrado?" y ahí moría: el camino
  // viajero→embajador no existía, justo el que más importa (a quien ya te
  // compró es a quien le pides que te recomiende).
  //
  // Se busca por `profiles.email` y no por la API de auth porque `listUsers`
  // solo pagina — y hoy no hay ni una cuenta de auth sin su fila en profiles.
  // ponytail: si algún día la hubiera, no la encuentra y vuelve a caer en el
  // error de `createUser`; el día que pase, un RPC DEFINER sobre auth.users.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existente } = await (svc as any)
    .from('profiles')
    .select('id, type, phone')
    .ilike('email', email)
    .maybeSingle()

  if (existente) {
    const yaEs = existente.type as string
    if (yaEs === 'embajador') {
      return { error: 'Ese correo ya es embajador. Búscalo en la lista de abajo.' }
    }
    // Solo se convierte al viajero. Un agente perdería el back-office y un
    // proveedor perdería su `supplier_id` (que en su caso ES el proveedor, no
    // quién lo reclutó): en ambos la conversión destruye el acceso que ya tiene.
    if (yaEs !== 'viajero') {
      return {
        error:
          yaEs === 'agente'
            ? 'Ese correo es de alguien del equipo: convertirlo lo sacaría del back-office.'
            : 'Ese correo es de un proveedor. Dale de alta al embajador con otro correo.',
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: convErr } = await (svc as any)
      .from('profiles')
      .update({
        name: nombre,
        type: 'embajador',
        active: true,
        referral_code: codigo,
        supplier_id: gate.supplierId,
        recruited_by: input.recruitedBy || null,
        phone: telefono ?? existente.phone ?? null,
        // ADR-0028: NO se toca la contraseña de quien ya tiene una. Ya entra
        // con la suya; emitirle una provisional le rompería el acceso.
      })
      .eq('id', existente.id)
    if (convErr) {
      const dup =
        (convErr as { code?: string }).code === '23505' &&
        String(convErr.message ?? '').includes('referral_code')
      return {
        error: dup
          ? 'Ese código de referido ya está en uso.'
          : safeError(convErr, 'No se pudo convertir la cuenta en embajador.'),
      }
    }
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
    // Sin credenciales: entra con la contraseña que ya usaba como viajero.
    return { ok: true, credentials: null, telefono: telefono ?? existente.phone ?? null }
  }

  const provisional = nuevaProvisional()
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password: provisional,
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
    recruited_by: input.recruitedBy || null,
    phone: telefono,
    // Nace con contraseña provisional: el portal lo manda a fijar la suya antes
    // de dejarlo pasar. Sin este flag la provisional se vuelve permanente.
    must_change_password: true,
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
  return { ok: true, credentials: { email, password: provisional }, telefono }
}
