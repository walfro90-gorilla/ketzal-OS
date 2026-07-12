import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSistema } from '@/lib/system-log'
import { mpSignatureValid } from '@/lib/mp-signature'

// Webhook de Mercado Pago. Público (lo llaman los servidores de MP; el proxy lo
// deja pasar via '/api/'). Consulta el pago real en MP con nuestro token y
// confirma vía service_role (SECURITY DEFINER). Idempotente. Registra
// errores/éxito en system_log.
//
// Autenticidad: si `MP_WEBHOOK_SECRET` está configurado, se EXIGE una firma
// `x-signature` válida (rechazo 401 si falta o no cuadra). Sin el secret, se
// deja pasar (rollout no-rompedor: el flujo real ya está protegido porque
// re-consultamos el pago a la API de MP con nuestro token). Poner el secret en
// Vercel activa el enforcement.
export async function POST(request: Request) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ ok: false, reason: 'not_configured' })

  const supabase = createServiceClient()

  // MP notifica por dos vías: webhook moderno (body {type, data:{id}}) e IPN
  // legacy (query ?topic=...&id=...). Capturamos tipo + id de ambas.
  const url = new URL(request.url)
  const queryDataId = url.searchParams.get('data.id')
  let notifType = url.searchParams.get('type') ?? url.searchParams.get('topic')
  let paymentId = queryDataId ?? url.searchParams.get('id')
  try {
    const body = (await request.json()) as {
      type?: string
      data?: { id?: string | number }
    }
    notifType = notifType ?? body?.type ?? null
    if (paymentId == null && body?.data?.id != null) paymentId = String(body.data.id)
  } catch {
    // sin body JSON: usamos solo la query
  }

  // Verificación de firma (fail-closed cuando hay secret). El manifest de MP usa
  // el `data.id` del query, no el del body.
  const webhookSecret = process.env.MP_WEBHOOK_SECRET
  if (webhookSecret) {
    const valido = mpSignatureValid({
      signatureHeader: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      dataId: queryDataId,
      secret: webhookSecret,
    })
    if (!valido) {
      await logSistema(supabase, 'mp_webhook', 'error', 'firma inválida', {
        paymentId,
        hasSignature: request.headers.get('x-signature') != null,
      })
      return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 401 })
    }
  }

  // Procesamos SOLO notificaciones de pago. MP también manda merchant_order (y
  // otras) cuyo id NO es un pago: consultarlo en /v1/payments da 404 y ensucia
  // el log de salud con errores falsos (sin afectar el cobro real).
  if (notifType && notifType !== 'payment') return NextResponse.json({ ok: true })
  if (!paymentId) return NextResponse.json({ ok: true })

  // Consultar el pago real en Mercado Pago (verificación con nuestro token).
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    await logSistema(supabase, 'mp_webhook', 'error', 'pago no encontrado en MP', {
      paymentId,
      http: res.status,
    })
    return NextResponse.json({ ok: false, reason: 'payment_not_found' })
  }

  const pago = (await res.json()) as { status?: string; external_reference?: string }
  const intentId = pago.external_reference
  const status = pago.status ?? 'pending'
  if (!intentId) return NextResponse.json({ ok: true })

  const { error } = await supabase.rpc('confirm_online_payment', {
    p_intent_id: intentId,
    p_mp_payment_id: String(paymentId),
    p_status: status,
  })
  if (error) {
    await logSistema(supabase, 'mp_webhook', 'error', 'fallo al confirmar pago', {
      paymentId,
      intentId,
      message: error.message,
    })
    // 500 → MP reintenta (el RPC confirm_online_payment es idempotente), en vez
    // de dar por perdido un pago real por un fallo transitorio nuestro.
    return NextResponse.json({ ok: false, reason: 'confirm_failed' }, { status: 500 })
  }

  await logSistema(supabase, 'mp_webhook', 'info', 'pago confirmado', {
    paymentId,
    intentId,
    status,
  })
  return NextResponse.json({ ok: true })
}
