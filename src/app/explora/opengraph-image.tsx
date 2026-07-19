import { listPublicServices } from './data'
import { ogCardResponse } from '@/lib/og-card'

// Preview social de la vitrina: compartir /explora por WhatsApp muestra
// tarjeta de marca (antes no había imagen → menos clics al link).
export const alt = 'Explora viajes — Ketzal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const servicios = await listPublicServices()
  const n = servicios.length

  return ogCardResponse({
    eyebrow: 'Vitrina de viajes',
    agency: 'Ketzal',
    title: 'Explora viajes',
    subtitle: 'Tours, paquetes y experiencias de agencias locales.',
    figure: n > 0 ? String(n) : '¡Pronto!',
    figureLabel: n === 1 ? 'viaje disponible' : 'viajes disponibles',
  })
}
