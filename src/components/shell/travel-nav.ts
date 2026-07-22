// Navegación del shell del VIAJERO (comprador B2C). Enfocada en su viaje, no en
// ventas/proveedores/dashboard. Fuente única para el header (desktop) y la bottom
// tab bar (móvil).
import type { ComponentType } from 'react'
import { LuggageIcon, CompassIcon, UserIcon } from 'lucide-react'

export type TravelNavItem = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

export const TRAVEL_NAV: TravelNavItem[] = [
  { label: 'Mis viajes', href: '/mis-compras', icon: LuggageIcon },
  // 'Explora' del viajero vive dentro del shell (/descubre reusa el catálogo
  // público) para no perder la bottom bar. /explora es la vitrina pública/SEO.
  { label: 'Explora', href: '/descubre', icon: CompassIcon },
  { label: 'Perfil', href: '/perfil', icon: UserIcon },
]

/** Activo si la ruta es exacta o subruta. */
export function isTravelNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
