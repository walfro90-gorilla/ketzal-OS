// Modelo de acceso por rol. Fuente única para páginas y navegación.
// - user        → agente de venta (de agencia o libre): Panel, Ventas, Clientes, Cotizaciones.
// - admin       → admin de agencia / proveedor: + Comisiones, Equipo, Servicios, Proveedores (de su ámbito).
// - superadmin  → todo.

export type Rol = 'user' | 'admin' | 'superadmin'

/** Roles con acceso a administración (catálogo, comisiones, equipo). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin'
}

/** Rutas de administración: solo admins/superadmin. */
export const ADMIN_HREFS = [
  '/comisiones',
  '/equipo',
  '/servicios',
  '/proveedores',
  '/reportes',
] as const

/** ¿La ruta requiere rol admin? (coincidencia exacta o subruta). */
export function isAdminRoute(href: string): boolean {
  return ADMIN_HREFS.some((a) => href === a || href.startsWith(`${a}/`))
}
