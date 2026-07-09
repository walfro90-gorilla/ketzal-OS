import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Webhook de Mercado Pago. Público (lo llaman los servidores de MP; el proxy lo
// deja pasar via '/api/'). Consulta el pago real en MP con nuestro token y
// confirma vía service_role (SECURITY DEFINER). Idempotente. Siempre responde 200
// para que MP no reintente indefinidamente.
export async function POST(request: Request) {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return NextResponse.json({ ok: false, reason: 'not_configured' })

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
  if (!res.ok) return NextResponse.json({ ok: false, reason: 'payment_not_found' })

  const pago = (await res.json()) as { status?: string; external_reference?: string }
  const intentId = pago.external_reference
  const status = pago.status ?? 'pending'
  if (!intentId) return NextResponse.json({ ok: true })

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('confirm_online_payment', {
    p_intent_id: intentId,
    p_mp_payment_id: String(paymentId),
    p_status: status,
  })
  if (error) return NextResponse.json({ ok: false, reason: error.message })

  return NextResponse.json({ ok: true })
}
