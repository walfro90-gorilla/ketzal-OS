import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOutIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getBrandLogo } from '@/lib/brand'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { getPersona, homeForPersona } from '@/lib/persona'

// Portal del PROVEEDOR. Chrome mínimo (logo + salir), read-only. Gate de persona:
// solo type='proveedor'; al resto lo manda a su propia superficie.
export const metadata = { robots: { index: false } }

export default async function ProveedorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const persona = await getPersona(supabase)
  if (persona !== 'provider') redirect(homeForPersona(persona))

  const logoUrl = await getBrandLogo()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
        <Link href="/proveedor" className="flex items-center gap-2 text-lg font-semibold">
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
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
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
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
    </div>
  )
}
