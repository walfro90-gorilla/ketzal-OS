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
        // b074: el fee sale del MISMO motor que el devengo (tarifa por servicio,
        // % o fijo por pax), prorrateado por el pago. Antes se calculaba con el
        // 10% plano de app_settings ⇒ divergía del devengo al configurar tarifas.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fee } = await (svcClient as any).rpc('platform_fee_for_payment', {
          p_booking: bookingId,
          p_amount: amount,
        })
        cobroToken = cuenta.access_token
        marketplaceFee = Number(fee ?? 0)
        esSplit = true
      }
    }
  } catch {
    /* best-effort: sin split cae al flujo actual */
  }
  return { cobroToken, marketplaceFee, esSplit }
}
