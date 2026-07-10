import Link from 'next/link'
import { Suspense } from 'react'
import { SidebarNav } from './sidebar-nav'
import { BottomTabs } from './bottom-tabs'
import { UserMenu } from './user-menu'
import { ThemeToggle } from './theme-toggle'
import { GlobalSearch } from './global-search'
import { FlashToasts } from './flash-toasts'

// Shell responsive de Ketzal OS (campo-primero):
//  - móvil: header compacto + contenido a ancho completo + bottom tab bar
//  - desktop (md+): sidebar fija a la izquierda; sin bottom bar
export function AppShell({
  email,
  displayName,
  role,
  children,
}: {
  email: string | null
  displayName: string | null
  role: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip link: teclado/lector de pantalla saltan la navegación. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <Suspense>
        <FlashToasts />
      </Suspense>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
        <Link href="/dashboard" className="text-lg font-semibold">
          Ketzal OS
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <GlobalSearch />
          <ThemeToggle />
          {email && <UserMenu email={email} displayName={displayName} />}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <div className="sticky top-14">
            <SidebarNav role={role} />
          </div>
        </aside>

        {/* pb-24 en móvil libera espacio para la bottom bar fija. */}
        <main
          id="contenido"
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 pb-24 outline-none md:p-6 md:pb-6"
        >
          {children}
        </main>
      </div>

      <BottomTabs role={role} />
    </div>
  )
}
