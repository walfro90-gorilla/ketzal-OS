// Fuente única de la navegación del shell (sidebar desktop + bottom tabs móvil).
// Cambiar una ruta o su ícono aquí se refleja en ambos.
import type { ComponentType } from 'react'
import {
  LayoutDashboardIcon,
  BanknoteIcon,
  UsersIcon,
  FileTextIcon,
  PercentIcon,
  MapPinIcon,
  Building2Icon,
} from 'lucide-react'

export type NavIcon = ComponentType<{ className?: string }>

export type NavItem = {
  label: string
  href: string
  icon: NavIcon
  /** true ⇒ va en la bottom tab bar; false ⇒ va en el sheet "Más". */
  primary: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Panel', href: '/dashboard', icon: LayoutDashboardIcon, primary: true },
  { label: 'Ventas', href: '/ventas', icon: BanknoteIcon, primary: true },
  { label: 'Clientes', href: '/clientes', icon: UsersIcon, primary: true },
  { label: 'Cotizaciones', href: '/cotizaciones', icon: FileTextIcon, primary: true },
  { label: 'Comisiones', href: '/comisiones', icon: PercentIcon, primary: false },
  { label: 'Servicios', href: '/servicios', icon: MapPinIcon, primary: false },
  { label: 'Proveedores', href: '/proveedores', icon: Building2Icon, primary: false },
]

export const PRIMARY_ITEMS = NAV_ITEMS.filter((i) => i.primary)
export const SECONDARY_ITEMS = NAV_ITEMS.filter((i) => !i.primary)

/** Activo si la ruta es exacta o una subruta (p.ej. /ventas/nueva ⇒ Ventas). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
