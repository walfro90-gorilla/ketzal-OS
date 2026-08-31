'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { nuevaProvisional } from '@/lib/auth/credenciales'

// F3 — Acceso de PROVEEDOR: da login a una persona ligada a un supplier como
// profile(type='proveedor', role='user', supplier_id). RLS por my_supplier_id la
// acota a lo suyo; role='user' le cierra todo lo admin/plataforma; type='proveedor'
// le recorta el nav (aún sin portal propio; el resto llega cuando se priorice).
// Requiere cuenta auth (profiles.id → auth.users) ⇒ service role + admin.createUser,
// con la puerta de superadmin puesta aquí (el service role no respeta RLS).

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
    return { error: 'Solo el god admin puede dar acceso a un proveedor.' }
  }
  return { ok: true }
}

/**
 * Devuelve la contraseña PROVISIONAL para que el superadmin se la mande al
 * proveedor. Antes devolvía un magic-link que nunca funcionó — el porqué,
 * medido, en `lib/auth/credenciales.ts`.
 */
export async function crearAccesoProveedor(input: {
  supplierId: string
  nombre: string
  email: string
  telefono?: string
}): Promise<
  | { error: string }
  | { ok: true; credentials: { email: string; password: string }; telefono: string | null }
> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  if (!input.supplierId) return { error: 'Falta el proveedor.' }
  if (!nombre) return { error: 'Escribe el nombre de la persona.' }

  // El correo es OBLIGATORIO: es el usuario que teclea para entrar. Antes se
  // sintetizaba un `<uuid>@proveedor.ketzal.local` cuando venía vacío, y eso solo
  // se sostenía mientras el acceso fuera un link; nadie dicta un UUID por
  // WhatsApp ni lo escribe en un teléfono.
  const email = input.email?.trim().toLowerCase()
  if (!email) return { error: 'Escribe el correo: con ese correo entra al portal.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ese correo no parece válido.' }
  }

  const telefono = input.telefono?.trim() || null
  const svc = createServiceClient()
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
    type: 'proveedor',
    role: 'user',
    active: true,
    supplier_id: input.supplierId,
    phone: telefono,
    // Nace con provisional: el portal lo manda a fijar la suya antes de pasar.
    must_change_password: true,
  })
  if (rowErr) {
    await svc.auth.admin.deleteUser(created.user.id)
    return { error: safeError(rowErr, 'No se pudo crear el acceso del proveedor.') }
  }

  revalidatePath(`/proveedores/${input.supplierId}`)
  return { ok: true, credentials: { email, password: provisional }, telefono }
}
