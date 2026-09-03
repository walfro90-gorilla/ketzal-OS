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
  BusIcon,
  QrCodeIcon,
  MapPinIcon,
  Building2Icon,
  UsersRoundIcon,
  UserRoundIcon,
  UserSearchIcon,
  ChartColumnIcon,
  VoteIcon,
  HandCoinsIcon,
  ScaleIcon,
  ReceiptTextIcon,
  ActivityIcon,
  SettingsIcon,
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
  /** Solo visible para el god admin (superadmin): viajeros. */
  superadminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Panel', href: '/dashboard', icon: LayoutDashboardIcon, primary: true },
  { label: 'Ventas', href: '/ventas', icon: BanknoteIcon, primary: true },
  { label: 'Clientes', href: '/clientes', icon: UsersIcon, primary: true },
  { label: 'Cotizaciones', href: '/cotizaciones', icon: FileTextIcon, primary: true },
  { label: 'Cobranza', href: '/cobranza', icon: HandCoinsIcon, primary: false },
  // b054: ya no es solo-admin — un agente con tarifa de comisión propia
  // necesita ver su propio saldo (ledger_summary ya filtra por RLS/guard).
  { label: 'Cuentas', href: '/cuentas', icon: ScaleIcon, primary: false },
  { label: 'Salidas', href: '/salidas', icon: BusIcon, primary: false },
  { label: 'Abordaje', href: '/abordaje', icon: QrCodeIcon, primary: false },
  { label: 'Gastos', href: '/gastos', icon: ReceiptTextIcon, primary: false, adminOnly: true },
  { label: 'Clawbot', href: '/clawbot', icon: BotIcon, primary: false },
  { label: 'Comisiones', href: '/comisiones', icon: PercentIcon, primary: false, adminOnly: true },
  { label: 'Reportes', href: '/reportes', icon: ChartColumnIcon, primary: false, adminOnly: true },
  { label: 'Investigación', href: '/investigacion', icon: VoteIcon, primary: false, adminOnly: true },
  { label: 'Equipo', href: '/equipo', icon: UsersRoundIcon, primary: false, adminOnly: true },
  { label: 'Viajeros', href: '/viajeros', icon: UserRoundIcon, primary: false, adminOnly: true, superadminOnly: true },
  // Expediente por cuenta (b066). NO es superadminOnly: el admin de agencia
  // necesita auditar a su propio equipo; `can_view_user` lo acota a su agencia.
  { label: 'Usuarios', href: '/usuarios', icon: UserSearchIcon, primary: false, adminOnly: true },
  { label: 'Servicios', href: '/servicios', icon: MapPinIcon, primary: false, adminOnly: true },
  { label: 'Proveedores', href: '/proveedores', icon: Building2Icon, primary: false, adminOnly: true },
  // Salud (invariantes globales) es de PLATAFORMA: solo superadmin. La página
  // ya se auto-protege; esto la saca del nav del admin de agencia.
  { label: 'Salud', href: '/salud', icon: ActivityIcon, primary: false, adminOnly: true, superadminOnly: true },
  // Configuración: el admin de agencia edita SU agencia (nombre, logo, cobros
  // MP); el superadmin además la plataforma (marca, WhatsApp). Antes la agencia
  // solo podía configurarse entrando a su propia fila en Proveedores.
  { label: 'Configuración', href: '/ajustes', icon: SettingsIcon, primary: false, adminOnly: true },
]

export const PRIMARY_ITEMS = NAV_ITEMS.filter((i) => i.primary)
export const SECONDARY_ITEMS = NAV_ITEMS.filter((i) => !i.primary)

/** Ítems visibles según el rol: oculta las rutas admin a los agentes y las
 *  god-admin (viajeros) a quien no sea superadmin. Embajador/proveedor no llegan
 *  aquí: tienen su propio portal (persona), fuera del shell de ops. */
export function navItemsForRole(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => {
    if (i.superadminOnly && role !== 'superadmin') return false
    return !i.adminOnly || isAdminRole(role)
  })
}

/** Activo si la ruta es exacta o una subruta (p.ej. /ventas/nueva ⇒ Ventas). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
