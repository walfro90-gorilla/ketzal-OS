import crypto from 'node:crypto'

// Verificación de la firma `x-signature` de los webhooks de Mercado Pago.
// MP firma cada notificación con HMAC-SHA256 sobre un "manifest" usando la clave
// secreta de la integración. Doc: el manifest es
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// (se omite la parte ausente). El header trae `ts=<n>,v1=<hexhash>`.
// Referencia: https://www.mercadopago.com.mx/developers → Webhooks → Validar origen.
//
// POR QUÉ ESTO DEVUELVE UN MOTIVO Y NO UN BOOLEANO
// ------------------------------------------------
// El 2026-09-10 el log tenía 12 rechazos `firma inválida`, los 12 del MISMO pago
// real (MP reintenta) y los 12 con `hasSignature: true`. Cero aceptadas desde que
// se configuró el secret. Un booleano no permite saber si falta el `data.id`, si
// el header viene mal armado o si el secret no corresponde — y sin eso el
// arreglo es adivinanza. Es el mismo expediente que `safeError` tapando el
// `check_violation` de b076: un rechazo mudo se queda meses.
//
// Y POR QUÉ SE PRUEBAN VARIOS `id`
// --------------------------------
// MP notifica por dos vías. El webhook moderno manda `?data.id=<n>` en el query
// y también `{data:{id}}` en el body; el IPN legacy manda `?topic=...&id=<n>`,
// sin `data.id`. El código sólo miraba `data.id` del query, así que en la vía
// legacy el manifest se armaba SIN `id:` y no podía cuadrar nunca. Probar los
// candidatos cubre las dos vías sin adivinar cuál está en uso, y `idUsado` deja
// escrito en el log cuál fue — que es el dato que hoy no existe.

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

export type MotivoFirma =
  | 'ok'
  | 'sin_secret'
  | 'sin_header'
  | 'header_sin_ts_o_v1'
  | 'no_cuadra'

export type ResultadoFirma = {
  valido: boolean
  motivo: MotivoFirma
  /** Con cuál candidato cuadró (null = sin `id:` en el manifest). Sólo si válido. */
  idUsado?: string | null
  /** Cuántos candidatos se probaron. Diagnóstico: 1 significa que sólo se probó "sin id". */
  candidatos: number
}

/**
 * ¿La firma del webhook es auténtica? Fail-closed ante cualquier duda, pero
 * devolviendo el MOTIVO para que el log sirva de algo.
 *
 * `dataIds` son los candidatos a `data.id`, en orden de preferencia: el del
 * query (`data.id`), el del query legacy (`id`) y el del body. Los repetidos y
 * los vacíos se descartan. Siempre se prueba además el manifest SIN `id:`, que
 * es la forma documentada cuando la notificación no trae id.
 *
 * NUNCA registra ni devuelve el secreto ni el hash esperado.
 */
export function verificarFirmaMp(input: {
  signatureHeader: string | null
  requestId: string | null
  dataIds: (string | null | undefined)[]
  secret: string
}): ResultadoFirma {
  const { signatureHeader, requestId, secret } = input
  if (!secret) return { valido: false, motivo: 'sin_secret', candidatos: 0 }
  if (!signatureHeader) return { valido: false, motivo: 'sin_header', candidatos: 0 }

  const { ts, v1 } = parseSignatureHeader(signatureHeader)
  if (!ts || !v1) return { valido: false, motivo: 'header_sin_ts_o_v1', candidatos: 0 }

  // Candidatos únicos, en orden, más el caso "sin id" al final.
  const ids: (string | null)[] = []
  for (const raw of input.dataIds) {
    if (raw == null || raw === '') continue
    const id = String(raw).toLowerCase()
    if (!ids.includes(id)) ids.push(id)
  }
  ids.push(null)

  for (const id of ids) {
    let manifest = ''
    if (id != null) manifest += `id:${id};`
    if (requestId) manifest += `request-id:${requestId};`
    manifest += `ts:${ts};`
    const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
    if (safeEqualHex(esperado, v1)) {
      return { valido: true, motivo: 'ok', idUsado: id, candidatos: ids.length }
    }
  }
  return { valido: false, motivo: 'no_cuadra', candidatos: ids.length }
}
