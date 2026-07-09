import Link from 'next/link'
import { SidebarNav } from './sidebar-nav'
import { BottomTabs } from './bottom-tabs'
import { UserMenu } from './user-menu'

// Shell responsive de Ketzal OS (campo-primero):
//  - móvil: header compacto + contenido a ancho completo + bottom tab bar
//  - desktop (md+): sidebar fija a la izquierda; sin bottom bar
export function AppShell({
  email,
  displayName,
  children,
}: {
  email: string | null
  displayName: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
        <Link href="/dashboard" className="text-lg font-semibold">
          Ketzal OS
        </Link>
        {email && <UserMenu email={email} displayName={displayName} />}
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <div className="sticky top-14">
            <SidebarNav />
          </div>
        </aside>

        {/* pb-24 en móvil libera espacio para la bottom bar fija. */}
        <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      <BottomTabs />
    </div>
  )
}
