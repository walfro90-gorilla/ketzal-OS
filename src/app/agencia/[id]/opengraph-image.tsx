import { getPublicSupplier } from './data'
import { ogCardResponse } from '@/lib/og-card'

// Preview social del perfil de agencia. Tarjeta de marca (mismo lenguaje que la
// ficha de servicio y los documentos) con el nombre de la agencia y su número
// de viajes activos como cifra focal. next/og (Satori): estilos inline, sin
// Tailwind — todo el trabajo visual vive en lib/og-card.tsx.
export const alt = 'Agencia de viajes — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const clamp = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const a = await getPublicSupplier(id)

  if (!a) {
    return ogCardResponse({
      eyebrow: 'Agencia',
      agency: 'Ketzal',
      title: 'Agencia no disponible',
      figure: '—',
      figureLabel: 'Ketzal',
    })
  }

  const titulo = a.info.about
    ? clamp(a.info.about, 66)
    : a.destinations.length
      ? clamp(a.destinations.join(' · '), 66)
      : 'Viajes en Ketzal'

  return ogCardResponse({
    eyebrow: a.info.city_zone
      ? `Agencia · ${clamp(a.info.city_zone, 30)}`
      : 'Agencia de viajes',
    agency: a.name,
    title: titulo,
    figure: String(a.active_trips),
    figureLabel: a.active_trips === 1 ? 'Viaje activo' : 'Viajes activos',
  })
}
