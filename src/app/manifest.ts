import type { MetadataRoute } from 'next'

// PWA instalable en móvil (Android/iOS) y desktop (Chrome/Edge).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ketzal OS',
    short_name: 'Ketzal',
    description: 'Back-office de ventas para agencias de viajes',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
