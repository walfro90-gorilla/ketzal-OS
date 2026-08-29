import { getPublicPoll } from '@/lib/public/encuesta'
import { ogCardResponse } from '@/lib/og-card'

// Preview social de la encuesta: el link se pega en Meta Ads y se comparte por
// WhatsApp, así que sin imagen pierde clics. El conteo de votos hace de gancho.
export const alt = 'Tú decides el próximo viaje — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const poll = await getPublicPoll(id)

  if (!poll) {
    return ogCardResponse({
      eyebrow: 'Investigación de mercado',
      agency: 'Ketzal',
      title: 'Encuesta no disponible',
      subtitle: 'Este enlace ya no está activo.',
      figure: '—',
      figureLabel: 'sin votos',
    })
  }

  return ogCardResponse({
    eyebrow: 'Tú decides el próximo viaje',
    agency: poll.agency.name ?? 'Ketzal',
    title: poll.question,
    subtitle: 'Vota a dónde y cuándo. Sin registro, en 20 segundos.',
    figure: poll.total_votes > 0 ? String(poll.total_votes) : '¡Sé el primero!',
    figureLabel: poll.total_votes === 1 ? 'voto y contando' : 'votos y contando',
  })
}
