'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

// CRUD de VIAJEROS (compradores B2C = ketzal.marketplace_customers).
//
// Solo el god admin. Como la identidad vive en auth.users (id = FK), crear y
// eliminar tocan auth ⇒ van por SERVICE ROLE (bypassa RLS). Por eso CADA acción
// verifica superadmin ANTES de usar el cliente de servicio: el service role no
// respeta RLS, la puerta la ponemos nosotros aquí.

/** Puerta: exige sesión de superadmin. Devuelve el uid o un error. */
async function requireSuperadmin(): Promise<{ uid: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') {
    return { error: 'Solo el god admin puede administrar viajeros.' }
  }
  return { uid: user.id }
}

export type ViajeroInput = {
  nombre: string
  email: string
  telefono?: string
}

/** Alta de viajero: crea la cuenta auth (confirmada) + su fila de comprador. */
export async function crearViajero(
  input: ViajeroInput & { password: string }
): Promise<{ error: string } | void> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  const email = input.email?.trim().toLowerCase()
  const telefono = input.telefono?.trim() || null
  const password = input.password ?? ''

  if (!nombre) return { error: 'Escribe el nombre del viajero.' }
  if (!email || !/.+@.+\..+/.test(email)) return { error: 'Escribe un correo válido.' }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const svc = createServiceClient()
  // Cuenta confirmada (la crea un admin de confianza) para que pueda entrar ya.
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nombre, phone: telefono },
  })
  if (authErr || !created?.user) {
    return { error: safeError(authErr, 'No se pudo crear la cuenta (¿correo ya registrado?).') }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rowErr } = await (svc as any).from('marketplace_customers').upsert({
    id: created.user.id,
    full_name: nombre,
    phone: telefono,
    email,
  })
  if (rowErr) {
    // Deshacer la cuenta auth para no dejar un huérfano sin fila de comprador.
    await svc.auth.admin.deleteUser(created.user.id)
    return { error: safeError(rowErr, 'No se pudo guardar el viajero.') }
  }

  revalidatePath('/viajeros')
  redirect('/viajeros?ok=viajero-creado')
}

/** Edita los datos de contacto del viajero (nombre + teléfono). */
export async function editarViajero(
  id: string,
  input: { nombre: string; telefono?: string }
): Promise<{ error: string } | { ok: true }> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  if (!nombre) return { error: 'Escribe el nombre del viajero.' }

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any)
    .from('marketplace_customers')
    .update({ full_name: nombre, phone: input.telefono?.trim() || null })
    .eq('id', id)
  if (error) return { error: safeError(error, 'No se pudo actualizar el viajero.') }

  revalidatePath('/viajeros')
  revalidatePath(`/viajeros/${id}`)
  return { ok: true }
}

/**
 * Elimina un viajero (su cuenta auth ⇒ cascada a marketplace_customers).
 * Guarda: si tiene compras se bloquea, para no destruir datos ligados a dinero.
 */
export async function eliminarViajero(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error: countErr } = await (svc as any)
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('marketplace_customer_id', id)
  if (countErr) return { error: safeError(countErr, 'No se pudo verificar sus compras.') }
  if ((count ?? 0) > 0) {
    return {
      error: `No se puede eliminar: el viajero tiene ${count} compra(s) registrada(s).`,
    }
  }

  const { error } = await svc.auth.admin.deleteUser(id)
  if (error) return { error: safeError(error, 'No se pudo eliminar el viajero.') }

  revalidatePath('/viajeros')
  return { ok: true }
}
