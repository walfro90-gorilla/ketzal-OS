'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

// Registro / datos del COMPRADOR B2C (terreno del marketplace, Fase B.0).
// El comprador es una cuenta aparte del agente: se registra con email+password
// (NO magic link / OAuth) para no pasar por /auth/callback, que es lo único que
// llama a ensure_profile. Así el comprador nunca nace como agente en `profiles`.
// La fila vive en ketzal.marketplace_customers (aislada, RLS solo-dueño); como
// es tabla nueva no tipada, se accede con cast (convención multi-agente).

export type RegistroInput = {
  nombre: string
  telefono: string
  email: string
  password: string
}

/** Crea la cuenta de comprador (auth + fila en marketplace_customers). */
export async function registrarComprador(
  input: RegistroInput
): Promise<{ error: string } | { ok: true; needsConfirmation: boolean }> {
  const nombre = input.nombre?.trim()
  const email = input.email?.trim().toLowerCase()
  const password = input.password ?? ''
  const telefono = input.telefono?.trim() || null

  if (!nombre) return { error: 'Escribe tu nombre.' }
  if (!email || !/.+@.+\..+/.test(email)) {
    return { error: 'Escribe un correo válido.' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: nombre, phone: telefono } },
  })
  if (error) return { error: safeError(error, 'No se pudo crear la cuenta.') }
  const user = data.user
  if (!user) return { error: 'No se pudo crear la cuenta.' }

  // Con service role: la fila se crea aunque aún no haya sesión (p. ej. si el
  // proyecto exige confirmar el correo). Idempotente por id.
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).from('marketplace_customers').upsert({
    id: user.id,
    full_name: nombre,
    phone: telefono,
    email,
  })

  return { ok: true, needsConfirmation: !data.session }
}

/** Completa/actualiza los datos de comprador para una sesión ya existente. */
export async function guardarComprador(input: {
  nombre: string
  telefono: string
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const nombre = input.nombre?.trim()
  if (!nombre) return { error: 'Escribe tu nombre.' }

  // RLS: solo la propia fila (id = auth.uid()).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('marketplace_customers').upsert({
    id: user.id,
    full_name: nombre,
    phone: input.telefono?.trim() || null,
    email: user.email ?? null,
  })
  if (error) return { error: safeError(error) }
  return { ok: true }
}

// Pedido de marketplace (B.1-1). Crea un booking 'draft' ligado al comprador vía
// el RPC create_marketplace_order (precio y cupo se validan server-side; no se
// confía en el precio del cliente). Sin pago aún: el checkout en línea es B.2.
export type PedidoItem = { pack_key: string; label: string; qty: number }

export async function crearPedido(input: {
  serviceId: string
  travelDate: string | null
  items: PedidoItem[]
}): Promise<{ error: string } | { ok: true; bookingId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }
  if (!input.items?.length) return { error: 'Selecciona al menos una opción.' }

  const { data, error } = await supabase.rpc('create_marketplace_order' as never, {
    p_service_id: input.serviceId,
    p_travel_date: input.travelDate,
    p_items: input.items,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo crear el pedido.') }
  return { ok: true, bookingId: data as unknown as string }
}
