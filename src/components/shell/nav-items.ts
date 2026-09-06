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
  GlobeIcon,
} from 'lucide-react'

export type NavIcon = ComponentType<{ className?: string }>

import { isAdminRole } from '@/lib/access'

// Secciones del nav, en el orden en que se pintan. La clave la usa cada ítem;
// el label es el encabezado del grupo en el sidebar. El agrupamiento es solo
// presentación: no cambia permisos ni rutas.
export const NAV_GROUPS = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'viajes', label: 'Operación de viaje' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'personas', label: 'Personas' },
  { key: 'plataforma', label: 'Plataforma' },
] as const

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key']

export type NavItem = {
  label: string
  href: string
  icon: NavIcon
  /** Sección del sidebar a la que pertenece. */
  group: NavGroupKey
  /** true ⇒ va en la bottom tab bar; false ⇒ va en el sheet "Más". */
  primary: boolean
  /** Solo visible para admin/superadmin (catálogo, comisiones, equipo). */
  adminOnly?: boolean
  /** Solo visible para el god admin (superadmin): viajeros. */
  superadminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  // ── Ventas: el día a día del agente ────────────────────────────────────
  { label: 'Panel', href: '/dashboard', icon: LayoutDashboardIcon, group: 'ventas', primary: true },
  { label: 'Ventas', href: '/ventas', icon: BanknoteIcon, group: 'ventas', primary: true },
  { label: 'Cotizaciones', href: '/cotizaciones', icon: FileTextIcon, group: 'ventas', primary: true },
  { label: 'Clientes', href: '/clientes', icon: UsersIcon, group: 'ventas', primary: true },
  { label: 'Cobranza', href: '/cobranza', icon: HandCoinsIcon, group: 'ventas', primary: false },
  { label: 'Clawbot', href: '/clawbot', icon: BotIcon, group: 'ventas', primary: false },
  // b054: ya no es solo-admin — un agente con tarifa de comisión propia
  // necesita ver su propio saldo (ledger_summary ya filtra por RLS/guard).
  { label: 'Cuentas', href: '/cuentas', icon: ScaleIcon, group: 'ventas', primary: false },
  // ── Operación de viaje: llevar la salida ───────────────────────────────
  { label: 'Salidas', href: '/salidas', icon: BusIcon, group: 'viajes', primary: false },
  { label: 'Abordaje', href: '/abordaje', icon: QrCodeIcon, group: 'viajes', primary: false },
  { label: 'Servicios', href: '/servicios', icon: MapPinIcon, group: 'viajes', primary: false, adminOnly: true },
  { label: 'Proveedores', href: '/proveedores', icon: Building2Icon, group: 'viajes', primary: false, adminOnly: true },
  // ── Finanzas: el dinero de la agencia (admin) ──────────────────────────
  { label: 'Gastos', href: '/gastos', icon: ReceiptTextIcon, group: 'finanzas', primary: false, adminOnly: true },
  { label: 'Comisiones', href: '/comisiones', icon: PercentIcon, group: 'finanzas', primary: false, adminOnly: true },
  { label: 'Reportes', href: '/reportes', icon: ChartColumnIcon, group: 'finanzas', primary: false, adminOnly: true },
  // ── Personas: equipo y clientes de la plataforma ───────────────────────
  { label: 'Equipo', href: '/equipo', icon: UsersRoundIcon, group: 'personas', primary: false, adminOnly: true },
  // Expediente por cuenta (b066). NO es superadminOnly: el admin de agencia
  // necesita auditar a su propio equipo; `can_view_user` lo acota a su agencia.
  { label: 'Usuarios', href: '/usuarios', icon: UserSearchIcon, group: 'personas', primary: false, adminOnly: true },
  { label: 'Viajeros', href: '/viajeros', icon: UserRoundIcon, group: 'personas', primary: false, adminOnly: true, superadminOnly: true },
  // ── Plataforma: superficie pública, herramientas y ajustes ─────────────
  { label: 'Investigación', href: '/investigacion', icon: VoteIcon, group: 'plataforma', primary: false, adminOnly: true },
  // ADR-0053: contenido público de los destinos. Es de PLATAFORMA (lo que ve
  // cualquier visitante), no de una agencia ⇒ solo superadmin.
  { label: 'Destinos', href: '/destinos', icon: GlobeIcon, group: 'plataforma', primary: false, adminOnly: true, superadminOnly: true },
  // Salud (invariantes globales) es de PLATAFORMA: solo superadmin. La página
  // ya se auto-protege; esto la saca del nav del admin de agencia.
  { label: 'Salud', href: '/salud', icon: ActivityIcon, group: 'plataforma', primary: false, adminOnly: true, superadminOnly: true },
  // Configuración: el admin de agencia edita SU agencia (nombre, logo, cobros
  // MP); el superadmin además la plataforma (marca, WhatsApp). Antes la agencia
  // solo podía configurarse entrando a su propia fila en Proveedores.
  { label: 'Configuración', href: '/ajustes', icon: SettingsIcon, group: 'plataforma', primary: false, adminOnly: true },
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

/** Ítems visibles por rol, ya partidos en secciones y en el orden de
 *  `NAV_GROUPS`. Un grupo sin ítems visibles (p.ej. Finanzas para un agente) no
 *  se incluye, así que quien lo pinta no tiene que filtrar encabezados vacíos. */
export function groupedNavItems(
  role: string | null | undefined
): { key: NavGroupKey; label: string; items: NavItem[] }[] {
  const visibles = navItemsForRole(role)
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: visibles.filter((i) => i.group === g.key),
  })).filter((g) => g.items.length > 0)
}

/** Activo si la ruta es exacta o una subruta (p.ej. /ventas/nueva ⇒ Ventas). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
