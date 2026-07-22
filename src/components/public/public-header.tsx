import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'

// Header compartido de la vitrina pública (marketplace): logo → inicio + nav.
// Server component; BrandLogo (cliente) resuelve el logo oficial con fallback.
// Se monta en /explora, /agencias y /agencia/[id] para dar navegación común.
export function PublicHeader() {
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
          <Link
            href="/entrar"
            className="font-medium text-primary hover:underline"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  )
}
