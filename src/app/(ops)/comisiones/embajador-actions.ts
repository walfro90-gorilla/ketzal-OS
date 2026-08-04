'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { notificar, superadmins } from '@/lib/push/send'

// Alta de EMBAJADOR = profile(type='embajador') con su cuenta auth (profiles.id
// → auth.users ON DELETE CASCADE, F2). No se loguea aún; el email real es opcional
// (si no se da, se sintetiza uno único). Solo superadmin; va por SERVICE ROLE
// (crea la cuenta auth y escribe profiles pese al lockdown b017), con la puerta
// de superadmin puesta aquí porque el service role no respeta RLS.

async function requireSuperadmin(): Promise<{ ok: true } | { error: string }> {
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
    return { error: 'Solo el god admin puede crear embajadores.' }
  }
  return { ok: true }
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
}): Promise<{ error: string } | { ok: true }> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  const codigo = normalizarReferral(input.codigo)
  if (!nombre) return { error: 'Escribe el nombre del embajador.' }
  if (!codigo) return { error: 'Escribe el código de referido (con él se atribuyen las ventas).' }

  const email =
    input.email?.trim().toLowerCase() || `${randomUUID()}@embajador.ketzal.local`
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
