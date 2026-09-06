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
    // Splash en blanco; la barra del sistema iguala el chrome oscuro de la app
    // (canvas #081512 = meta theme-color dark), no el teal: contra el header
    // oscuro la franja teal se veía como una banda pegada arriba.
    background_color: '#ffffff',
    theme_color: '#081512',
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
