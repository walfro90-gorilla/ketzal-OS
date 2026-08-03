import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { createClient } from '@/lib/supabase/server'
import { getPersona, homeForPersona, type Persona } from '@/lib/persona'

// Header compartido de la vitrina pública (marketplace): logo → inicio + nav.
// Server component; BrandLogo (cliente) resuelve el logo oficial con fallback.
// Detecta sesión: si hay usuario, muestra su superficie (Mis compras / Panel /
// Embajador / Proveedor) en vez de "Entrar" — así la vitrina refleja el login.
// Se monta en /explora, /agencias, /agencia/[id], /servicio/[id] y /comprar.

const CUENTA_LABEL: Record<Persona, string> = {
  traveler: 'Mis compras',
  agent: 'Mi panel',
  ambassador: 'Embajador',
  provider: 'Proveedor',
}

export async function PublicHeader() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const persona = user ? await getPersona(supabase) : null

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/explora" aria-label="Ketzal — inicio" className="shrink-0">
          <BrandLogo />
        </Link>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          <Link
            href="/explora"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Explora
          </Link>
          <Link
            href="/agencias"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Agencias
          </Link>
          {persona ? (
            <Link
              href={homeForPersona(persona)}
              className="font-medium text-primary hover:underline"
            >
              {CUENTA_LABEL[persona]}
            </Link>
          ) : (
            <Link href="/entrar" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
