import crypto from 'node:crypto'

// Verificación de la firma `x-signature` de los webhooks de Mercado Pago.
// MP firma cada notificación con HMAC-SHA256 sobre un "manifest" usando la clave
// secreta de la integración. Doc: el manifest es
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// (se omite la parte ausente). El header trae `ts=<n>,v1=<hexhash>`.
// Referencia: https://www.mercadopago.com.mx/developers → Webhooks → Validar origen.

/** Parsea "ts=123,v1=abc" → { ts, v1 }. */
function parseSignatureHeader(header: string): { ts?: string; v1?: string } {
  const out: Record<string, string> = {}
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return out
}

/** Comparación en tiempo constante de dos hex de misma semántica. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

/**
 * ¿La firma del webhook es auténtica? Devuelve false ante cualquier duda
 * (header ausente/mal formado, id faltante, hash que no cuadra) — fail-closed.
 * `dataId` debe ser el valor del query param `data.id` (MP lo minusculiza si es
 * alfanumérico; los ids de pago son numéricos, minúscula es no-op).
 */
export function mpSignatureValid(input: {
  signatureHeader: string | null
  requestId: string | null
  dataId: string | null
  secret: string
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = input
  if (!signatureHeader || !secret) return false
  const { ts, v1 } = parseSignatureHeader(signatureHeader)
  if (!ts || !v1) return false

  let manifest = ''
  if (dataId != null) manifest += `id:${dataId.toLowerCase()};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  return safeEqualHex(expected, v1)
}
