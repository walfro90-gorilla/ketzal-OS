import Link from 'next/link'
import { LogOutIcon } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { TravelBottomNav } from './travel-bottom-nav'
import { TRAVEL_NAV } from './travel-nav'

// Shell del VIAJERO (comprador B2C), campo-primero:
//  - móvil: header compacto + contenido a ancho completo + bottom tab bar
//  - desktop (md+): mismo header con la navegación inline; sin bottom bar
// Distinto del AppShell del back-office: aquí NO hay sidebar, ni ventas, ni
// proveedores; solo las herramientas del viaje.
export function TravelShell({
  email,
  logoUrl = null,
  children,
}: {
  email: string | null
  logoUrl?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
        <Link href="/mis-compras" className="flex items-center gap-2 text-lg font-semibold">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Ketzal" className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/192" alt="" className="size-8 object-contain" />
              <span className="text-primary">Ketzal</span>
            </>
          )}
        </Link>

        {/* Navegación inline (solo desktop; en móvil va abajo). */}
        <nav aria-label="Navegación del viajero" className="hidden items-center gap-1 md:flex">
          {TRAVEL_NAV.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {email && (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOutIcon className="size-5" />
              </button>
            </form>
          )}
        </div>
      </header>

      {/* pb-24 en móvil libera espacio para la bottom bar fija. */}
      <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-6">
        {children}
      </main>

      <TravelBottomNav />
    </div>
  )
}
