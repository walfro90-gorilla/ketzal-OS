// Fuente única de la navegación del shell (sidebar desktop + bottom tabs móvil).
// Cambiar una ruta o su ícono aquí se refleja en ambos.
import type { ComponentType } from 'react'
import {
  LayoutDashboardIcon,
  BanknoteIcon,
  BotIcon,
  UsersIcon,
  FileTextIcon,
  PercentIcon,
  MapPinIcon,
  Building2Icon,
  UsersRoundIcon,
  ChartColumnIcon,
  HandCoinsIcon,
  ActivityIcon,
} from 'lucide-react'

export type NavIcon = ComponentType<{ className?: string }>

import { isAdminRole } from '@/lib/access'

export type NavItem = {
  label: string
  href: string
  icon: NavIcon
  /** true ⇒ va en la bottom tab bar; false ⇒ va en el sheet "Más". */
  primary: boolean
  /** Solo visible para admin/superadmin (catálogo, comisiones, equipo). */
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Panel', href: '/dashboard', icon: LayoutDashboardIcon, primary: true },
  { label: 'Ventas', href: '/ventas', icon: BanknoteIcon, primary: true },
  { label: 'Clientes', href: '/clientes', icon: UsersIcon, primary: true },
  { label: 'Cotizaciones', href: '/cotizaciones', icon: FileTextIcon, primary: true },
  { label: 'Cobranza', href: '/cobranza', icon: HandCoinsIcon, primary: false },
  { label: 'Clawbot', href: '/clawbot', icon: BotIcon, primary: false },
  { label: 'Comisiones', href: '/comisiones', icon: PercentIcon, primary: false, adminOnly: true },
  { label: 'Reportes', href: '/reportes', icon: ChartColumnIcon, primary: false, adminOnly: true },
  { label: 'Equipo', href: '/equipo', icon: UsersRoundIcon, primary: false, adminOnly: true },
  { label: 'Servicios', href: '/servicios', icon: MapPinIcon, primary: false, adminOnly: true },
  { label: 'Proveedores', href: '/proveedores', icon: Building2Icon, primary: false, adminOnly: true },
  { label: 'Salud', href: '/salud', icon: ActivityIcon, primary: false, adminOnly: true },
]

export const PRIMARY_ITEMS = NAV_ITEMS.filter((i) => i.primary)
export const SECONDARY_ITEMS = NAV_ITEMS.filter((i) => !i.primary)

/** Ítems visibles según el rol: oculta las rutas admin a los agentes. */
export function navItemsForRole(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.adminOnly || isAdminRole(role))
}

/** Activo si la ruta es exacta o una subruta (p.ej. /ventas/nueva ⇒ Ventas). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
