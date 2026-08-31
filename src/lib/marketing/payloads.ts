/** Builders PUROS de payloads de conversión server-side (ADR-0025). Separados
 *  de conversions.ts para testearlos en vitest sin tocar red ni envs.
 *  Portados de estampida (validados en vivo contra Meta y GA4). */

import { createHash } from 'node:crypto'

export interface ConversionInput {
  /** booking_id del pedido: event_id (Meta) y transaction_id (GA4). */
  orderId: string
  /** Total de la venta en MXN (pesos, no centavos — ADR-0009). */
  value: number
  currency: string
  eventSourceUrl: string
  fbclid?: string | null
  /** Cookie _fbp del pixel (fb.1.<ts>.<id>) — el matcher estándar de Meta. */
  fbp?: string | null
  /** Cookie _fbc exacta del pixel; preferida sobre reconstruirla del fbclid. */
  fbcCookie?: string | null
  clientIp?: string | null
  clientUa?: string | null
  testEventCode?: string | null
}

/** Meta Conversions API. `event_id = orderId`: la llave de dedupe. */
export function buildMetaPurchase(input: ConversionInput) {
  return buildMetaEvent(input, 'Purchase')
}

/** Señal de intención al crear el pedido — Meta optimiza entrega con ella
 *  aunque la compra llegue después por el webhook. */
export function buildMetaInitiateCheckout(input: ConversionInput) {
  return buildMetaEvent(input, 'InitiateCheckout')
}

function buildMetaEvent(
  input: ConversionInput,
  eventName: 'Purchase' | 'InitiateCheckout'
) {
  const eventTime = Math.floor(Date.now() / 1000)
  return {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: input.orderId,
        action_source: 'website',
        event_source_url: input.eventSourceUrl,
        user_data: {
          // Meta RECHAZA eventos sin ningún "customer information parameter"
          // (error 2804050, mordió en producción en estampida). external_id
          // (hash del booking_id) garantiza siempre al menos uno; IP y
          // user-agent reales del comprador (capturados al crear el pedido)
          // dan el matching de verdad. Sin email hasheado hasta que el aviso
          // de privacidad lo cubra (ADR-0025, decisión abierta de Wal).
          external_id: createHash('sha256').update(input.orderId).digest('hex'),
          ...(input.clientIp ? { client_ip_address: input.clientIp } : {}),
          ...(input.clientUa ? { client_user_agent: input.clientUa } : {}),
          ...(input.fbp ? { fbp: input.fbp } : {}),
          // La cookie _fbc es el valor exacto que puso el pixel; reconstruirla
          // del fbclid es el fallback para quien lo bloqueó.
          ...(input.fbcCookie
            ? { fbc: input.fbcCookie }
            : input.fbclid
              ? { fbc: `fb.1.${eventTime * 1000}.${input.fbclid}` }
              : {}),
        },
        custom_data: {
          value: input.value,
          currency: input.currency,
        },
      },
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
  }
}

/** GA4 Measurement Protocol. Sin client_id real del navegador (el pago se
 *  confirma en el webhook, no en el cliente) se deriva uno ESTABLE del
 *  booking_id — reintentos producen el mismo, y transaction_id dedupea.
 *  ponytail: client_id derivado no une la compra a la sesión del navegador;
 *  si eso importa, guardar el client_id real de gtag en el pedido (v2). */
export function buildGa4Purchase(input: ConversionInput) {
  return buildGa4Event(input, 'purchase')
}

export function buildGa4BeginCheckout(input: ConversionInput) {
  return buildGa4Event(input, 'begin_checkout')
}

function buildGa4Event(
  input: ConversionInput,
  name: 'purchase' | 'begin_checkout'
) {
  return {
    client_id: `${stableHash(input.orderId)}.${stableHash(input.orderId + 'salt')}`,
    events: [
      {
        name,
        params: {
          // transaction_id solo dedupea purchases; en begin_checkout es
          // inocuo y conserva la traza al pedido.
          transaction_id: input.orderId,
          value: input.value,
          currency: input.currency,
        },
      },
    ],
  }
}

function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}
