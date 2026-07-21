import { ogCardResponse } from '@/lib/og-card'
import { listPublicSuppliers } from './data'

// Preview social del directorio de agencias. Tarjeta de marca con el conteo de
// agencias como cifra focal. next/og (Satori): estilos inline en lib/og-card.tsx.
export const alt = 'Agencias de viajes — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const agencias = await listPublicSuppliers()
  return ogCardResponse({
    eyebrow: 'Directorio',
    agency: 'Ketzal',
    title: 'Agencias de viajes',
    subtitle: 'Conoce a quién opera cada viaje',
    figure: String(agencias.length),
    figureLabel: agencias.length === 1 ? 'Agencia' : 'Agencias',
  })
}
