import { getReceipt } from './data'
import { ogCardResponse } from '@/lib/og-card'

// Preview social del recibo. Next inyecta el <meta og:image> absoluto a esta ruta.
export const alt = 'Recibo de pago — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: Promise<{ receiptId: string }>
}) {
  const { receiptId } = await params
  const r = await getReceipt(receiptId)

  if (!r) {
    return ogCardResponse({
      eyebrow: 'Recibo',
      agency: 'Ketzal',
      title: 'Enlace no disponible',
      figure: '—',
      figureLabel: 'Monto',
    })
  }

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  })
  const isRefund = r.tipo === 'refund'
  const folio = String(r.folio).padStart(4, '0')

  return ogCardResponse({
    eyebrow: isRefund ? 'Recibo de reembolso' : 'Recibo de pago',
    agency: r.agencia,
    title: `Folio #${folio}`,
    subtitle: [r.cliente ?? undefined, r.concepto].filter(Boolean).join(' · '),
    figure: `${money.format(Number(r.monto))} MXN`,
    figureLabel: isRefund ? 'Monto reembolsado' : 'Monto recibido',
    // Reembolso en rojo de marca; abono en verde hoja (default).
    accent: isRefund ? '#FF5A6A' : undefined,
  })
}
