import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

// Footer compartido de la vitrina pública. Marca + navegación + acceso de
// agencias. Server component. Va al fondo (el <main> con flex-1 lo empuja).
export function PublicFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BrandMark className="size-5 text-primary" />
          <span>Ketzal — viajes de agencias locales</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
          <Link href="/explora" className="transition-colors hover:text-foreground">
            Explora
          </Link>
          <Link href="/agencias" className="transition-colors hover:text-foreground">
            Agencias
          </Link>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Soy agencia
          </Link>
        </nav>
      </div>
    </footer>
  )
}
