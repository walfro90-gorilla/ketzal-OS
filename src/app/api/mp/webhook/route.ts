import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSistema } from '@/lib/system-log'

// Webhook de Mercado Pago. Público (lo llaman los servidores de MP; el proxy lo
// deja pasar via '/api/'). Consulta el pago real en MP con nuestro token y
// confirma vía service_role (SECURITY DEFINER). Idempotente. Siempre responde 200
// para que MP no reintente indefinidamente. Registra errores/éxito en system_log.
export async function POST(request: Request) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ ok: false, reason: 'not_configured' })

  const supabase = createServiceClient()

  // El payment id llega en query (?type=payment&data.id=) o en el body {type, data:{id}}.
  const url = new URL(request.url)
  let paymentId = url.searchParams.get('data.id') ?? url.searchParams.get('id')
  if (!paymentId) {
    try {
      const body = (await request.json()) as { data?: { id?: string | number } }
      if (body?.data?.id != null) paymentId = String(body.data.id)
    } catch {
      // sin body JSON: nada que hacer
    }
  }
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
    return NextResponse.json({ ok: false, reason: error.message })
  }

  await logSistema(supabase, 'mp_webhook', 'info', 'pago confirmado', {
    paymentId,
    intentId,
    status,
  })
  return NextResponse.json({ ok: true })
}
