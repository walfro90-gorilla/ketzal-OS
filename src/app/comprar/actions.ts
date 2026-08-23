'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { esBannerValido } from '@/lib/storage/banner-url'
import { adminsDeAgencia, notificar, superadmins } from '@/lib/push/send'

// Registro / datos del COMPRADOR B2C (terreno del marketplace).
// El comprador es un profile de tipo 'viajero' (refactor de identidad, F1): un
// solo modelo de persona diferenciado por `type`. Nace 'viajero' (no agente) al
// registrarse; nunca pasa por ensure_profile como agente. profiles no está tipado
// para estas columnas nuevas ⇒ se accede con cast (convención multi-agente).

export type RegistroInput = {
  nombre: string
  telefono: string
  email: string
  password: string
  /** Token de hCaptcha resuelto en el navegador. Vacío si la protección está apagada. */
  captchaToken?: string
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
    options: {
      data: { full_name: nombre, phone: telefono },
      // Lo resuelve el navegador y viaja hasta aquí: Auth lo verifica contra
      // hCaptcha cuando la protección está prendida. Sin ella, undefined.
      captchaToken: input.captchaToken,
    },
  })
  if (error) return { error: safeError(error, 'No se pudo crear la cuenta.') }
  const user = data.user
  if (!user) return { error: 'No se pudo crear la cuenta.' }

  // Con service role: el profile se crea aunque aún no haya sesión (p. ej. si el
  // proyecto exige confirmar el correo; sin sesión no hay auth.uid para el RPC).
  // authenticated no puede escribir profiles (b017) ⇒ va por service role. Nace
  // 'viajero' + activo. Idempotente por id.
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).from('profiles').upsert({
    id: user.id,
    name: nombre,
    phone: telefono,
    email,
    type: 'viajero',
    active: true,
  })

  // Bitácora (b066): el alta se registra con service role porque si el proyecto
  // exige confirmar el correo, todavía no hay sesión y `auth.uid()` sería null.
  const cab = await headers()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).rpc('log_user_event', {
    p_user: user.id,
    p_kind: 'signup',
    p_meta: { via: 'marketplace' },
    p_ip: (cab.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null,
    p_user_agent: cab.get('user-agent'),
  })

  // b036: cuenta realmente NUEVA (identities vacío = correo ya registrado, no
  // avisar de nuevo) ⇒ notificar a los superadmins. Best-effort.
  if (user.identities?.length) {
    try {
      await notificar(await superadmins(), {
        title: 'Viajero nuevo registrado',
        body: `${nombre} (${email}) creó su cuenta en el marketplace.`,
        url: '/viajeros',
      })
    } catch {
      /* best-effort */
    }
  }

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

  // Con sesión: authenticated no puede escribir profiles (b017) ⇒ RPC DEFINER
  // que actualiza el propio profile (auth.uid). No convierte a un agente en viajero.
  const { error } = await supabase.rpc('register_traveler' as never, {
    p_full_name: nombre,
    p_phone: input.telefono?.trim() || null,
  } as never)
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
  /** Código de embajador que refirió la compra (?ref). Best-effort. */
  ref?: string | null
  /** C2: el comprador marcó "acepto la política de cancelación". Obligatorio. */
  aceptaPolitica?: boolean
}): Promise<{ error: string } | { ok: true; bookingId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para continuar.' }
  if (!input.items?.length) return { error: 'Selecciona al menos una opción.' }
  if (!input.aceptaPolitica) {
    return { error: 'Acepta la política de cancelación para continuar.' }
  }

  const { data, error } = await supabase.rpc('create_marketplace_order' as never, {
    p_service_id: input.serviceId,
    p_travel_date: input.travelDate,
    p_items: input.items,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo crear el pedido.') }
  const bookingId = data as unknown as string

  // C2: sella la aceptación de la política (snapshot congelado + evidencia
  // ip/ua en policy_accepted_meta, canal 'checkout'). Best-effort: el pedido
  // ya existe; si esto falla, la aceptación puede sellarse después desde la
  // cotización o por el agente.
  try {
    const h = await headers()
    await supabase.rpc('accept_booking_policy' as never, {
      p_booking: bookingId,
      p_canal: 'checkout',
      p_meta: {
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        ua: h.get('user-agent')?.slice(0, 300) || null,
      },
    } as never)
  } catch {
    /* best-effort */
  }

  // Atribución del embajador por ?ref. BEST-EFFORT: si algo falla (código
  // inválido, sin tarifa, etc.) el RPC devuelve null y la compra NO se rompe.
  if (input.ref?.trim()) {
    await supabase.rpc('attribute_booking_by_ref' as never, {
      p_booking: bookingId,
      p_ref: input.ref.trim(),
    } as never)
  }

  // b036: avisar a los admins de la agencia — llegó una cotización (pedido
  // draft) del marketplace. Si la ficha de cliente en esa agencia se acaba de
  // crear (primera compra ahí), se marca "cliente nuevo". Best-effort.
  try {
    const svc = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svc as any)
      .from('bookings')
      .select('selling_supplier_id, total, customer:customers(full_name, created_at), service:services(name)')
      .eq('id', bookingId)
      .maybeSingle()
    if (b?.selling_supplier_id) {
      const clienteNuevo =
        b.customer?.created_at &&
        Date.now() - new Date(b.customer.created_at).getTime() < 5 * 60_000
      const admins = await adminsDeAgencia(b.selling_supplier_id)
      const monto = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(Number(b.total))
      await notificar(admins, {
        title: clienteNuevo
          ? 'Nueva cotización · cliente nuevo'
          : 'Nueva cotización del marketplace',
        body: `${b.customer?.full_name ?? 'Comprador'} — ${b.service?.name ?? 'viaje'} por ${monto}.`,
        url: `/ventas/${bookingId}`,
      })
    }
  } catch {
    /* best-effort */
  }

  return { ok: true, bookingId }
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

  // b053 — SPLIT: si la agencia vendedora tiene su cuenta MP conectada, la
  // preferencia se crea con SU token + marketplace_fee (el % de plataforma):
  // el dinero cae directo a la agencia y el fee se separa AL COBRAR. Sin
  // cuenta conectada: flujo actual (token de plataforma) y el ledger registra
  // el payout a 7 días al confirmarse el pago.
  const svcClient = createServiceClient()
  let cobroToken = token
  let marketplaceFee = 0
  let esSplit = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svcClient as any)
      .from('bookings')
      .select('selling_supplier_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (b?.selling_supplier_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cuenta } = await (svcClient as any)
        .from('mp_accounts')
        .select('access_token')
        .eq('supplier_id', b.selling_supplier_id)
        .maybeSingle()
      if (cuenta?.access_token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cfg } = await (svcClient as any)
          .from('app_settings')
          .select('platform_commission_rate')
          .limit(1)
          .maybeSingle()
        const pct = Number(cfg?.platform_commission_rate ?? 0)
        cobroToken = cuenta.access_token
        marketplaceFee = Math.round(Number(intent.amount) * (pct / 100) * 100) / 100
        esSplit = true
      }
    }
  } catch {
    /* best-effort: sin split cae al flujo actual */
  }

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cobroToken}` },
    body: JSON.stringify({
      items: [
        {
          title: `Pedido ${bookingId.slice(0, 8)}`,
          quantity: 1,
          unit_price: Number(intent.amount),
          currency_id: 'MXN',
        },
      ],
      ...(esSplit && marketplaceFee > 0 ? { marketplace_fee: marketplaceFee } : {}),
      external_reference: intent.id,
      notification_url: `${origin}/api/mp/webhook`,
      // Tras pagar, MP regresa al perfil del comprador ("Mis compras"), donde
      // ve su pedido y espera la validación (el webhook lo pasa a pagado async).
      // `auto_return: 'approved'` hace que MP redirija SOLO (sin clic manual) tras
      // aprobar. El success URL va limpio (sin query-strings propios): el "/fatal/"
      // del sandbox venía de auto_return + params en la URL que fijamos nosotros;
      // MP agrega sus propios params en el redirect, que /mis-compras usa para el
      // banner de "validando". Validado en prod.
      back_urls: {
        success: `${origin}/mis-compras`,
        failure: `${origin}/mis-compras`,
        pending: `${origin}/mis-compras`,
      },
      auto_return: 'approved',
    }),
  })
  if (!res.ok) return { error: 'Mercado Pago rechazó la solicitud. Intenta de nuevo.' }
  const pref = (await res.json()) as { init_point?: string }
  if (!pref.init_point) return { error: 'Mercado Pago no devolvió un link de pago.' }

  // b053: marca el intent como split (el webhook/RPC postean el asiento del
  // fee cobrado en vez de la deuda de payout). Best-effort.
  if (esSplit) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svcClient as any)
        .from('payment_intents')
        .update({ split: true, mp_fee: marketplaceFee })
        .eq('id', intent.id)
    } catch {
      /* best-effort */
    }
  }

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
  const plan = data as unknown as PlanPreview

  // Fecha límite de la venta AUTOMÁTICA = última fecha del plan. El comprador
  // no puede escribir bookings (RLS) ⇒ service role, acotado a SU pedido (el
  // RPC ya validó la propiedad; el eq extra es defensa). Best-effort.
  if (plan.final) {
    try {
      const svc = createServiceClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any)
        .from('bookings')
        .update({ due_date: plan.final })
        .eq('id', bookingId)
        .eq('marketplace_customer_id', user.id)
    } catch {
      /* best-effort */
    }
  }
  return { plan }
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

// b034: datos SPEI de la agencia vendedora de un pedido del comprador.
// Reusa list_my_marketplace_orders (ya scoped al uid) — sin RPC nuevo; el
// viajero no puede leer suppliers directo (RLS).
export type SpeiInfo = {
  clabe: string
  banco: string | null
  titular: string | null
  /** Depósito en efectivo en cajero (b038): cuenta y tarjeta de débito. */
  cuenta: string | null
  tarjeta: string | null
  agencia: string
}

export async function obtenerSpeiPedido(
  bookingId: string
): Promise<{ spei: SpeiInfo | null }> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_my_marketplace_orders' as never)
  const orders =
    (data as unknown as { booking_id: string; spei: SpeiInfo | null }[]) ?? []
  return { spei: orders.find((o) => o.booking_id === bookingId)?.spei ?? null }
}

// b034: el comprador declara que ya hizo la transferencia SPEI. Queda como
// payment_intent (provider='spei', pending) hasta que el admin la confirme en
// Cobranza — el guard (dueño del pedido, monto ≤ saldo) vive en el RPC.
// b035: comprobante (captura del pago) OBLIGATORIO; debe ser URL del propio
// Storage (esBannerValido — misma defensa anti-URL-arbitraria que los banners).
export async function enviarPagoSpei(input: {
  bookingId: string
  amount: number
  reference?: string
  receiptUrl: string
}): Promise<{ error: string } | { ok: true }> {
  if (!esBannerValido(input.receiptUrl)) {
    return { error: 'Adjunta el comprobante de tu transferencia.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_spei_payment' as never, {
    p_booking_id: input.bookingId,
    p_amount: input.amount,
    p_reference: input.reference?.trim() || null,
    p_receipt_url: input.receiptUrl,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar tu transferencia.') }

  // b036: avisar a los admins de la agencia (in-app + push) — hay una
  // transferencia por confirmar. Best-effort: no bloquea la declaración.
  try {
    const svc = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svc as any)
      .from('bookings')
      .select('selling_supplier_id')
      .eq('id', input.bookingId)
      .maybeSingle()
    if (b?.selling_supplier_id) {
      const admins = await adminsDeAgencia(b.selling_supplier_id)
      await notificar(admins, {
        title: 'Transferencia SPEI por confirmar',
        body: `Un comprador declaró una transferencia de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(input.amount)}.`,
        url: '/cobranza',
      })
    }
  } catch {
    /* best-effort */
  }
  return { ok: true }
}
