'use client'

import { useState } from 'react'
import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarNav } from './sidebar-nav'

const COOKIE = 'sidebar_collapsed'

// Sidebar de escritorio colapsable (solo md+). El estado se guarda en una cookie
// que el layout (servidor) lee para el render inicial ⇒ sin parpadeo al recargar.
export function DesktopSidebar({
  role,
  defaultCollapsed = false,
}: {
  role: string | null
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      document.cookie = `${COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r transition-[width] duration-200 ease-out md:block',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav role={role} collapsed={collapsed} />
        </div>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className={cn(
              'flex w-full items-center rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            )}
          >
            {collapsed ? (
              <ChevronsRightIcon className="size-4 shrink-0" />
            ) : (
              <>
                <ChevronsLeftIcon className="size-4 shrink-0" />
                <span>Colapsar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
