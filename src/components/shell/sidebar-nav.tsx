'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { navItemsForRole, isNavActive } from './nav-items'

export function SidebarNav({
  role,
  collapsed = false,
}: {
  role: string | null
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const items = navItemsForRole(role)

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
      {items.map(({ label, href, icon: Icon }) => {
        const active = isNavActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            // Colapsado: solo ícono ⇒ el nombre va en aria-label/title (tooltip).
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
