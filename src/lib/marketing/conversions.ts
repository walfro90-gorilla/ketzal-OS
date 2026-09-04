import { createServiceClient } from '@/lib/supabase/service'
import { SITE_URL } from '@/lib/site-url'
import {
  buildMetaPurchase,
  buildMetaInitiateCheckout,
  buildGa4Purchase,
  buildGa4BeginCheckout,
  type ConversionInput,
} from './payloads'

/** Conversiones server-side hacia Meta CAPI y GA4 Measurement Protocol
 *  (ADR-0025). Purchase se dispara desde los caminos que confirman dinero
 *  (webhook MP, Brick inline, approve SPEI en Cobranza) — la fuente de
 *  verdad del pago, inmune a adblockers y webviews.
 *
 *  Nunca lanza: una conversión fallida se loggea (booleanos, sin secretos) y
 *  jamás afecta el 200 del webhook. Sin envs configuradas: no-op silencioso.
 *  Quitar las vars de Vercel apaga la medición sin tocar código. */
export async function sendPurchaseEvents(
  bookingId: string
): Promise<{ meta: string; ga4: string }> {
  return sendConversion(bookingId, 'purchase')
}

/** Señal de intención al crear el pedido (`after()` en crearPedido): no
 *  bloquea la respuesta al comprador. */
export async function sendCheckoutEvents(
  bookingId: string
): Promise<{ meta: string; ga4: string }> {
  return sendConversion(bookingId, 'begin_checkout')
}

type Attr = {
  fbclid?: string
  fbp?: string
  fbc?: string
  ip?: string
  ua?: string
}

async function sendConversion(
  bookingId: string,
  kind: 'purchase' | 'begin_checkout'
): Promise<{ meta: string; ga4: string }> {
  const result = { meta: 'skipped', ga4: 'skipped' }
  try {
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
    const capiToken = process.env.META_CAPI_TOKEN
    const gaId = process.env.NEXT_PUBLIC_GA_ID
    const gaSecret = process.env.GA4_API_SECRET
    const metaReady = Boolean(pixelId && capiToken)
    const ga4Ready = Boolean(gaId && gaSecret)
    if (!metaReady && !ga4Ready) return result

    const svc = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svc as any)
      .from('bookings')
      .select('id, total, currency, service_id, marketplace_customer_id, attribution')
      .eq('id', bookingId)
      .maybeSingle()
    // Solo pedidos del marketplace: las ventas manuales del OS no son
    // conversiones de ads (mismo criterio que la comisión del portal, b072).
    if (!b?.marketplace_customer_id) return result

    if (kind === 'purchase') {
      // Solo el PRIMER abono confirmado convierte (ADR-0025): la venta es UNA
      // conversión, no una por abono del plan de pagos.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (svc as any)
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId)
        .eq('type', 'payment')
        .eq('status', 'COMPLETED')
      if ((count ?? 0) !== 1) return result
      // ponytail: un retry del webhook tras ese primer abono re-envía el mismo
      // event_id; Meta dedupea 48h y GA4 por transaction_id siempre. Si algún
      // día molesta, gatear por el payment_id fresco del RPC.
    }

    const attr = (b.attribution ?? {}) as Attr
    const input: ConversionInput = {
      orderId: b.id,
      value: Number(b.total),
      currency: b.currency ?? 'MXN',
      eventSourceUrl: b.service_id
        ? `${SITE_URL}/servicio/${b.service_id}`
        : SITE_URL,
      fbclid: attr.fbclid ?? null,
      fbp: attr.fbp ?? null,
      fbcCookie: attr.fbc ?? null,
      clientIp: attr.ip ?? null,
      clientUa: attr.ua ?? null,
      testEventCode: process.env.META_TEST_EVENT_CODE ?? null,
    }

    const calls: Promise<void>[] = []
    if (metaReady) {
      calls.push(
        fetch(
          // Nunca loggear esta URL (lleva el token): solo el status.
          `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${capiToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              kind === 'purchase'
                ? buildMetaPurchase(input)
                : buildMetaInitiateCheckout(input)
            ),
            signal: AbortSignal.timeout(3000),
          }
        ).then(async (r) => {
          result.meta = r.ok ? 'sent' : `failed_${r.status}`
          if (!r.ok) {
            // Sin esto un `failed_400` es indebugueable (pasó el 2026-09-03 al
            // estrenar el pixel). La respuesta de Meta no trae el token: se
            // loggea código y mensaje (190 = token inválido, 100 = payload malo).
            const err = (await r.json().catch(() => null)) as {
              error?: { code?: number; error_subcode?: number; message?: string }
            } | null
            console.error(
              'conversions meta',
              r.status,
              err?.error?.code,
              err?.error?.error_subcode,
              err?.error?.message
            )
          }
        })
      )
    }
    if (ga4Ready) {
      calls.push(
        fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${gaId}&api_secret=${gaSecret}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              kind === 'purchase'
                ? buildGa4Purchase(input)
                : buildGa4BeginCheckout(input)
            ),
            signal: AbortSignal.timeout(3000),
          }
        ).then((r) => {
          // GA4 MP responde 2xx aun con payload inválido; el shape se valida
          // en unit tests y contra DebugView cuando existan las envs.
          result.ga4 = r.ok ? 'sent' : `failed_${r.status}`
        })
      )
    }
    const settled = await Promise.allSettled(calls)
    for (const [i, s] of settled.entries()) {
      if (s.status === 'rejected') {
        const key = metaReady && i === 0 ? 'meta' : 'ga4'
        result[key as 'meta' | 'ga4'] = 'failed_network'
      }
    }
    console.log('conversions', kind, bookingId, `meta=${result.meta}`, `ga4=${result.ga4}`)
    return result
  } catch (err) {
    console.error(
      'conversions failed for booking',
      bookingId,
      err instanceof Error ? err.message : 'error'
    )
    return result
  }
}
