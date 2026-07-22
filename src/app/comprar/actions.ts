'use server'

import { headers } from 'next/headers'
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

// B.2a: link de pago en línea (contado) para un pedido del comprador. Crea el
// payment_intent vía RPC (monto autoritativo = saldo, decidido server-side) y una
// preferencia de Checkout Pro. El webhook /api/mp/webhook confirma el pago
// (registra el abono, toma cupo, marca pagado). Reusa la infra MP ya validada.
export async function crearLinkPagoMarketplace(
  bookingId: string,
  serviceId: string,
  amount?: number,
): Promise<{ error: string } | { url: string }> {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) {
    return { error: 'El pago en línea aún no está disponible. Coordina con la agencia.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para pagar.' }

  // amount undefined ⇒ null ⇒ saldo completo (contado). B.2b pasa el enganche.
  const { data, error } = await supabase.rpc('create_marketplace_payment_intent' as never, {
    p_booking_id: bookingId,
    p_amount: amount ?? null,
  } as never)
  if (error || !data) return { error: safeError(error, 'No se pudo iniciar el pago.') }
  const intent = data as unknown as { id: string; amount: number }

  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [
        {
          title: `Pedido ${bookingId.slice(0, 8)}`,
          quantity: 1,
          unit_price: Number(intent.amount),
          currency_id: 'MXN',
        },
      ],
      external_reference: intent.id,
      notification_url: `${origin}/api/mp/webhook`,
      // Tras pagar, MP regresa al perfil del comprador ("Mis compras"), donde
      // ve su pedido y espera la validación (el webhook lo pasa a pagado async).
      // Sin auto_return ni query-strings propios (la combinación es la causa #1
      // del "/fatal/" en MP); MP agrega sus propios params, que /mis-compras usa
      // para mostrar el banner de "validando".
      back_urls: {
        success: `${origin}/mis-compras`,
        failure: `${origin}/mis-compras`,
        pending: `${origin}/mis-compras`,
      },
    }),
  })
  if (!res.ok) return { error: 'Mercado Pago rechazó la solicitud. Intenta de nuevo.' }
  const pref = (await res.json()) as { init_point?: string }
  if (!pref.init_point) return { error: 'Mercado Pago no devolvió un link de pago.' }

  return { url: pref.init_point }
}

// B.2b: plan de pagos (enganche + abonos) para el comprador.
export type PlanPreview = {
  total: number
  enganche: number
  resto: number
  num_abonos: number
  monto_abono: number
  final: string
}

/** Preview del plan (cálculo puro, no persiste). finalDate = salida o la que eligió. */
export async function previewPlan(
  total: number,
  finalDate: string,
  frequency: string,
): Promise<{ error: string } | { plan: PlanPreview }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const { data, error } = await supabase.rpc('preview_payment_plan' as never, {
    p_total: total,
    p_final: finalDate,
    p_frequency: frequency,
  } as never)
  if (error || !data) return { error: safeError(error, 'No se pudo calcular el plan.') }
  return { plan: data as unknown as PlanPreview }
}

/** Genera y persiste el plan del pedido del comprador. finalDate null ⇒ usa la salida. */
export async function generarPlanMarketplace(
  bookingId: string,
  frequency: string,
  finalDate: string | null,
): Promise<{ error: string } | { plan: PlanPreview }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }

  const { data, error } = await supabase.rpc('generate_marketplace_payment_plan' as never, {
    p_booking_id: bookingId,
    p_frequency: frequency,
    p_final_date: finalDate,
  } as never)
  if (error || !data) return { error: safeError(error, 'No se pudo crear el plan.') }
  return { plan: data as unknown as PlanPreview }
}

// B.3: calificación post-viaje del comprador (viajero→proveedor / →app).
export async function calificar(
  bookingId: string,
  kind: 'traveler_to_provider' | 'traveler_to_app',
  rating: number,
  comment?: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para calificar.' }

  const { error } = await supabase.rpc('submit_rating' as never, {
    p_booking_id: bookingId,
    p_kind: kind,
    p_rating: rating,
    p_comment: comment ?? null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo enviar tu calificación.') }
  return { ok: true }
}
