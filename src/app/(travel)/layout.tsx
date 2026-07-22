import { createClient } from '@/lib/supabase/server'
import { getBrandLogo } from '@/lib/brand'
import { TravelShell } from '@/components/shell/travel-shell'

// Layout del VIAJERO. Envuelve /mis-compras y /perfil con el shell del viaje.
// El gate de sesión lo hace el middleware (estas rutas no son públicas); el gate
// de persona lo hace (ops)/layout.tsx en sentido inverso (echa a los viajeros).
export default async function TravelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const logoUrl = await getBrandLogo()

  return (
    <TravelShell email={user?.email ?? null} logoUrl={logoUrl}>
      {children}
    </TravelShell>
  )
}
