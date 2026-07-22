import { getQuote } from './data'
import { ogCardResponse } from '@/lib/og-card'

// Preview social de la cotización (WhatsApp/Telegram/Twitter). Next inyecta
// automáticamente el <meta og:image>/twitter:image absoluto a esta ruta.
export const alt = 'Cotización de viaje — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const dateFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const quote = await getQuote(token)

  // Link inválido/expirado: tarjeta de marca genérica (nunca una imagen rota).
  if (!quote) {
    return ogCardResponse({
      eyebrow: 'Cotización',
      agency: 'Ketzal',
      title: 'Enlace no disponible',
      figure: '—',
      figureLabel: 'Total',
    })
  }

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  })
  const fecha = quote.travel_date
    ? dateFmt.format(new Date(`${quote.travel_date}T00:00:00`))
    : 'Fecha por definir'
  const subtitle = [
    `Para ${quote.customer.full_name}`,
    `${quote.num_pax} pax`,
    fecha,
  ].join(' · ')

  return ogCardResponse({
    eyebrow: 'Cotización de viaje',
    agency: quote.agency.name,
    title: quote.service?.name ?? 'Viaje a medida',
    subtitle,
    figure: `${money.format(Number(quote.total))} MXN`,
    figureLabel: 'Total',
  })
}
