import { createHmac, timingSafeEqual } from 'node:crypto'

// Certificado digital del voucher (b042): HMAC-SHA256 del uuid del voucher con
// una llave derivada del service key (propósito fijo ⇒ no expone la llave ni
// requiere env nueva). El QR impreso lleva ?c=<firma>; al escanearlo, la
// página recomputa y muestra "verificado" o "inválido" — un voucher
// falsificado (folio photoshopeado) no puede producir una firma válida.

function llave(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return k ? `voucher-cert:${k}` : ''
}

/** Firma corta (20 chars base64url) del voucher. '' si no hay llave (dev). */
export function firmarVoucher(voucherId: string): string {
  const k = llave()
  if (!k) return ''
  return createHmac('sha256', k).update(voucherId).digest('base64url').slice(0, 20)
}

/** null = sin certificado en la URL (vista normal); true/false = verificación. */
export function verificarCert(
  voucherId: string,
  c: string | string[] | undefined
): boolean | null {
  const cert = Array.isArray(c) ? c[0] : c
  if (!cert) return null
  const esperado = firmarVoucher(voucherId)
  if (!esperado) return null
  try {
    return timingSafeEqual(Buffer.from(cert), Buffer.from(esperado))
  } catch {
    return false // longitud distinta = inválido
  }
}
