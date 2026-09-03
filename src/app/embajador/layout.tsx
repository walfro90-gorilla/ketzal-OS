import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOutIcon, TicketIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getBrandLogo } from '@/lib/brand'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { debeCambiarPassword, getPersona, homeForPersona } from '@/lib/persona'
import { ProductTour } from '@/components/shell/tour/product-tour'
import { InstalarApp } from '@/components/shell/instalar-app'

// Portal del EMBAJADOR. Chrome mínimo (logo + salir), sin back-office ni viaje.
// Gate de persona: solo type='embajador'; al resto lo manda a su propia superficie.
export const metadata = { robots: { index: false } }

export default async function EmbajadorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const persona = await getPersona(supabase)
  if (persona !== 'ambassador') redirect(homeForPersona(persona))

  // Contraseña provisional sin cambiar: fijar la propia antes de entrar.
  if (await debeCambiarPassword(supabase, user.id)) redirect('/nueva-password')

  const logoUrl = await getBrandLogo()

  // Un embajador recién reclutado aterrizaba aquí sin saber qué hacer. El tour
  // se auto-abre solo la primera vez (onboarded_at, m005).
  const { data: perfil } = await supabase
    .from('profiles' as never)
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle()
  const yaVisto = Boolean((perfil as { onboarded_at: string | null } | null)?.onboarded_at)

  // b087: al cliente que se volvió embajador no se le quitan sus compras (los
  // RPC filtran por auth.uid(), no por tipo), pero '/' lo trae aquí y sin este
  // enlace no vuelve. Solo se pinta si de verdad compró algo: un embajador que
  // nunca fue cliente no necesita una pestaña vacía.
  const { data: comprasRaw } = await supabase.rpc('list_my_marketplace_orders' as never)
  const tieneCompras = ((comprasRaw ?? []) as unknown[]).length > 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-6">
        <Link href="/embajador" className="flex items-center gap-2 text-lg font-semibold">
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
          {tieneCompras && (
            <Link
              href="/mis-compras"
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
            >
              <TicketIcon className="size-4 shrink-0" />
              <span className="hidden sm:inline">Mis compras</span>
            </Link>
          )}
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
      <main id="contenido" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        {children}
        <ProductTour
          persona="embajador"
          seenKey="ketzal_tour_embajador_v1"
          yaVisto={yaVisto}
        />
        <InstalarApp esperar={!yaVisto} />
      </main>
    </div>
  )
}
