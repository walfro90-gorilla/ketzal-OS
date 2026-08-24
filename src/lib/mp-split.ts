import { createServiceClient } from '@/lib/supabase/service'

// b053: si la agencia vendedora de un pedido tiene su cuenta MP conectada, el
// cobro se hace con SU token + una comisión de plataforma — el dinero cae
// directo a la agencia y el fee se separa al cobrar. Extraído de
// crearLinkPagoMarketplace (Checkout Pro) para que el checkout embebido
// (Payment Brick, Checkout API) lo reuse sin duplicar la lógica.

export type SplitResolution = {
  /** Token con el que se debe crear el cobro en Mercado Pago. */
  cobroToken: string
  /** Comisión de plataforma en MXN a separar (0 si no hay split). */
  marketplaceFee: number
  esSplit: boolean
}

/** Best-effort: cualquier fallo cae al token de plataforma, sin split. */
export async function resolverSplitMp(
  bookingId: string,
  amount: number,
  platformToken: string
): Promise<SplitResolution> {
  let cobroToken = platformToken
  let marketplaceFee = 0
  let esSplit = false
  try {
    const svcClient = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svcClient as any)
      .from('bookings')
      .select('selling_supplier_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (b?.selling_supplier_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cuenta } = await (svcClient as any)
        .from('mp_accounts')
        .select('access_token')
        .eq('supplier_id', b.selling_supplier_id)
        .maybeSingle()
      if (cuenta?.access_token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cfg } = await (svcClient as any)
          .from('app_settings')
          .select('platform_commission_rate')
          .limit(1)
          .maybeSingle()
        const pct = Number(cfg?.platform_commission_rate ?? 0)
        cobroToken = cuenta.access_token
        marketplaceFee = Math.round(Number(amount) * (pct / 100) * 100) / 100
        esSplit = true
      }
    }
  } catch {
    /* best-effort: sin split cae al flujo actual */
  }
  return { cobroToken, marketplaceFee, esSplit }
}
