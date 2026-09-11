import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSistema } from '@/lib/system-log'
import { verificarFirmaMp } from '@/lib/mp-signature'
import { adminsDeAgencia, notificar, superadmins } from '@/lib/push/send'
import { sendPurchaseEvents } from '@/lib/marketing/conversions'

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

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
    // Se prueban los tres orígenes posibles del `data.id`: el del webhook
    // moderno (query `data.id`), el del IPN legacy (query `id`) y el del body.
    // Antes sólo se miraba el primero, así que por la vía legacy el manifest se
    // armaba sin `id:` y la firma no podía cuadrar nunca.
    const firma = verificarFirmaMp({
      signatureHeader: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      dataIds: [queryDataId, url.searchParams.get('id'), paymentId],
      secret: webhookSecret,
    })
    if (!firma.valido) {
      // El motivo es lo que convierte este rechazo en algo accionable: dice si
      // faltó el header, si venía mal armado o si de plano el hash no cuadra
      // (secret equivocado). Nunca se registra el secreto ni el hash esperado.
      await logSistema(supabase, 'mp_webhook', 'error', 'firma inválida', {
        paymentId,
        motivo: firma.motivo,
        candidatosId: firma.candidatos,
        traeDataIdEnQuery: queryDataId != null,
        traeIdLegacyEnQuery: url.searchParams.get('id') != null,
        hasSignature: request.headers.get('x-signature') != null,
        largoSecret: webhookSecret.length,
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
  // b053: los pagos SPLIT se crean con el token del VENDEDOR — si el token de
  // plataforma no lo encuentra (404), se reintenta con los tokens de las
  // cuentas MP conectadas (pocas agencias; el primero que responda gana).
  let res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cuentas } = await (supabase as any)
      .from('mp_accounts')
      .select('access_token')
    for (const c of (cuentas ?? []) as { access_token: string }[]) {
      const intento = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${c.access_token}` } }
      )
      if (intento.ok) {
        res = intento
        break
      }
    }
  }
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

  const { data: confirmado, error } = await supabase.rpc('confirm_online_payment', {
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

  // b105: un approved cuyo intento ya no existe es dinero real sin pedido. No
  // es éxito ni error transitorio (reintentar no lo arregla): se registra como
  // crítico y se avisa al superadmin para devolverlo. 200 para que MP no insista.
  const r = confirmado as { ok?: boolean; reason?: string } | null
  if (r && r.ok === false && r.reason === 'intent_not_found') {
    await logSistema(supabase, 'mp_webhook', 'critical', 'pago aprobado sin intento', {
      paymentId,
      intentId,
      status,
    })
    if (status === 'approved') {
      try {
        await notificar(await superadmins(), {
          evento: 'pago',
          title: 'Pago de Mercado Pago sin pedido',
          body: `MP aprobó el pago ${paymentId} y su intento ${intentId} no existe. Revísalo y devuélvelo.`,
          url: '/ventas',
        })
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ ok: false, reason: 'intent_not_found' })
  }

  await logSistema(supabase, 'mp_webhook', 'info', 'pago confirmado', {
    paymentId,
    intentId,
    status,
  })

  // b036: avisar a los admins de la agencia (in-app + push) del pago aprobado.
  // Best-effort: un fallo aquí no debe tumbar el webhook (el dinero ya entró).
  if (status === 'approved') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: intent } = await (supabase as any)
        .from('payment_intents')
        .select('supplier_id, amount, booking_id')
        .eq('id', intentId)
        .maybeSingle()
      if (intent?.supplier_id) {
        const admins = await adminsDeAgencia(intent.supplier_id)
        await notificar(admins, {
          evento: 'pago',
          title: 'Pago en línea recibido',
          body: `Abono de ${mxn.format(Number(intent.amount))} por Mercado Pago.`,
          url: `/ventas/${intent.booking_id}`,
        })
      }
      // ADR-0025: Purchase server-side (Meta CAPI + GA4). El helper gatea a
      // pedidos del marketplace y al primer abono confirmado; nunca lanza.
      if (intent?.booking_id) await sendPurchaseEvents(intent.booking_id)
    } catch {
      /* best-effort */
    }
  }
  return NextResponse.json({ ok: true })
}
