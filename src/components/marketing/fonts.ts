import { Inter } from 'next/font/google'

// Cuerpo de la home (ADR-0046). Vive aquí y no en el layout raíz a propósito:
// next/font solo inyecta el @font-face en las páginas que montan un componente
// que lo use, así el OS no descarga Inter. La variable la lee `font-body`
// (globals.css) dentro del wrapper que lleve `inter.variable`.
// `display: swap` y `adjustFontFallback: true` son los defaults de next/font.
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})
