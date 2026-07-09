import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single()
    displayName = profile?.name ?? null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-lg font-semibold">Ketzal OS</span>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {displayName ? `${displayName} · ${user.email}` : user.email}
            </span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
        )}
      </header>
      <div className="flex flex-1">
        <nav className="w-48 border-r p-4">
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/dashboard" className="hover:underline">
                Panel
              </Link>
            </li>
            <li>
              <Link href="/ventas" className="hover:underline">
                Ventas
              </Link>
            </li>
            <li>
              <Link href="/cotizaciones" className="hover:underline">
                Cotizaciones
              </Link>
            </li>
            <li>
              <Link href="/clientes" className="hover:underline">
                Clientes
              </Link>
            </li>
            <li>
              <Link href="/comisiones" className="hover:underline">
                Comisiones
              </Link>
            </li>
            <li>
              <Link href="/servicios" className="hover:underline">
                Servicios
              </Link>
            </li>
            <li>
              <Link href="/proveedores" className="hover:underline">
                Proveedores
              </Link>
            </li>
          </ul>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
