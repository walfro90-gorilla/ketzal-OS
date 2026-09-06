'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { groupedNavItems, isNavActive } from './nav-items'

export function SidebarNav({
  role,
  collapsed = false,
}: {
  role: string | null
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const groups = groupedNavItems(role)

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
      {groups.map((group, gi) => (
        <Fragment key={group.key}>
          {/* Encabezado del grupo. Expandido: etiqueta; colapsado: una línea
              divisoria (no cabe texto). El primero no lleva separador arriba. */}
          {collapsed ? (
            gi > 0 && <div className="mx-2 my-1.5 border-t" />
          ) : (
            <p
              className={cn(
                'px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground/70 uppercase',
                gi > 0 && 'pt-4'
              )}
            >
              {group.label}
            </p>
          )}
          {group.items.map(({ label, href, icon: Icon }) => {
            const active = isNavActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                data-tour={href}
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
        </Fragment>
      ))}
    </nav>
  )
}
