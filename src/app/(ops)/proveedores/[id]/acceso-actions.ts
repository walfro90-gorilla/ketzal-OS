'use server'

import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

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

export async function crearAccesoProveedor(input: {
  supplierId: string
  nombre: string
  email?: string
}): Promise<{ error: string } | { ok: true; link?: string }> {
  const gate = await requireSuperadmin()
  if ('error' in gate) return gate

  const nombre = input.nombre?.trim()
  if (!input.supplierId) return { error: 'Falta el proveedor.' }
  if (!nombre) return { error: 'Escribe el nombre de la persona.' }

  const email =
    input.email?.trim().toLowerCase() || `${randomUUID()}@proveedor.ketzal.local`
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
    type: 'proveedor',
    role: 'user',
    active: true,
    supplier_id: input.supplierId,
  })
  if (rowErr) {
    await svc.auth.admin.deleteUser(created.user.id)
    return { error: safeError(rowErr, 'No se pudo crear el acceso del proveedor.') }
  }

  revalidatePath(`/proveedores/${input.supplierId}`)

  // Magic-link para que el proveedor entre (se copia y se manda por WhatsApp;
  // funciona aunque el correo sea sintético). Si falla, la cuenta ya quedó creada.
  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`
  const { data: linkData } = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  })
  const link = linkData?.properties?.action_link
  return link ? { ok: true, link } : { ok: true }
}
