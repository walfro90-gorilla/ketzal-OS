'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TRAVEL_NAV, isTravelNavActive } from './travel-nav'

// Bottom tab bar del viajero (solo móvil). Respeta el safe-area del home indicator.
export function TravelBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegación del viajero"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-3">
        {TRAVEL_NAV.map(({ label, href, icon: Icon }) => {
          const active = isTravelNavActive(pathname, href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
