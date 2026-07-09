'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MoreHorizontalIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { navItemsForRole, isNavActive } from './nav-items'

// Bottom tab bar (sólo móvil). Rutas primarias + "Más" que abre un sheet
// con el resto (solo admin). Respeta el safe-area del home indicator de iOS.
export function BottomTabs({ role }: { role: string | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = navItemsForRole(role)
  const primaryItems = items.filter((i) => i.primary)
  const secondaryItems = items.filter((i) => !i.primary)
  const hasMore = secondaryItems.length > 0
  const moreActive = secondaryItems.some((i) => isNavActive(pathname, i.href))

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <ul className={cn('grid', hasMore ? 'grid-cols-5' : 'grid-cols-4')}>
        {primaryItems.map(({ label, href, icon: Icon }) => {
          const active = isNavActive(pathname, href)
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
        {hasMore && (
        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={cn(
                'flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                moreActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <MoreHorizontalIcon className="size-5 shrink-0" />
              Más
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <SheetHeader>
                <SheetTitle>Más</SheetTitle>
              </SheetHeader>
              <ul className="flex flex-col gap-1 px-2 pb-2">
                {secondaryItems.map(({ label, href, icon: Icon }) => {
                  const active = isNavActive(pathname, href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        )}
                      >
                        <Icon className="size-5 shrink-0" />
                        {label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
        )}
      </ul>
    </nav>
  )
}
