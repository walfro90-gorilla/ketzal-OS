import { createHmac, timingSafeEqual } from 'node:crypto'

// OAuth marketplace de Mercado Pago (b053): cada agencia conecta SU cuenta MP
// para que el split ocurra al cobrar. El `state` del flujo va FIRMADO (HMAC con
// llave derivada del service key — mismo patrón que voucher-cert) para que el
// callback no acepte supplier_id arbitrarios.

function llave(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return k ? `mp-oauth:${k}` : ''
}

export function mpOauthConfigured(): boolean {
  return Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)
}

/** state = <supplierId>.<firma> */
export function firmarState(supplierId: string): string {
  const k = llave()
  if (!k) return supplierId
  const sig = createHmac('sha256', k).update(supplierId).digest('base64url').slice(0, 20)
  return `${supplierId}.${sig}`
}

/** Devuelve el supplierId si la firma es válida; null si no. */
export function verificarState(state: string | null): string | null {
  if (!state) return null
  const [supplierId, sig] = state.split('.')
  if (!supplierId || !sig) return null
  const k = llave()
  if (!k) return null
  const esperado = createHmac('sha256', k).update(supplierId).digest('base64url').slice(0, 20)
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)) ? supplierId : null
  } catch {
    return null
  }
}
