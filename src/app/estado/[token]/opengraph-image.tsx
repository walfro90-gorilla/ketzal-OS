import { getStatement } from './data'
import { ogCardResponse } from '@/lib/og-card'

// Preview social del estado de cuenta. Next inyecta el <meta og:image> absoluto.
export const alt = 'Estado de cuenta — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const s = await getStatement(token)

  if (!s) {
    return ogCardResponse({
      eyebrow: 'Estado de cuenta',
      agency: 'Ketzal',
      title: 'Enlace no disponible',
      figure: '—',
      figureLabel: 'Saldo',
    })
  }

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  })
  const saldo = Number(s.saldo)
  const liquidada = saldo <= 0

  return ogCardResponse({
    eyebrow: `Estado de cuenta · Folio ${s.folio}`,
    agency: s.agencia,
    title: s.servicio ?? 'Venta de viaje',
    subtitle: [
      s.cliente ?? undefined,
      `Pagado ${money.format(Number(s.pagado))} de ${money.format(Number(s.total))}`,
    ]
      .filter(Boolean)
      .join(' · '),
    figure: liquidada
      ? 'Liquidada'
      : `${money.format(saldo)} MXN`,
    figureLabel: liquidada ? 'Estado' : 'Saldo pendiente',
  })
}
