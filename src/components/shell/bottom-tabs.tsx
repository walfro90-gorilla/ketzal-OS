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
import { PRIMARY_ITEMS, SECONDARY_ITEMS, isNavActive } from './nav-items'

// Bottom tab bar (sólo móvil). 4 rutas primarias + "Más" que abre un sheet
// con el resto. Respeta el safe-area del home indicator de iOS.
export function BottomTabs() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const moreActive = SECONDARY_ITEMS.some((i) => isNavActive(pathname, i.href))

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_ITEMS.map(({ label, href, icon: Icon }) => {
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
                {SECONDARY_ITEMS.map(({ label, href, icon: Icon }) => {
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
                            ? 'bg-secondary text-secondary-foreground'
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
      </ul>
    </nav>
  )
}
