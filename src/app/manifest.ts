import type { MetadataRoute } from 'next'

// PWA instalable en móvil (Android/iOS) y desktop (Chrome/Edge).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Ketzal OS',
    short_name: 'Ketzal',
    description: 'Back-office de ventas para agencias de viajes',
    lang: 'es-MX',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Splash en blanco; la barra del sistema con el teal de marca (BRAND.md).
    background_color: '#ffffff',
    theme_color: '#00805F',
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
    // Accesos rápidos (long-press del ícono instalado) a las 2 acciones de campo.
    shortcuts: [
      {
        name: 'Nueva venta',
        url: '/ventas/nueva',
        icons: [{ src: '/icons/192', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Cobranza',
        url: '/cobranza',
        icons: [{ src: '/icons/192', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
