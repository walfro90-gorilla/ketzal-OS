import { createClient } from '@/lib/supabase/server'
import { getBrandLogo } from '@/lib/brand'
import { TravelShell } from '@/components/shell/travel-shell'
import { ProductTour } from '@/components/shell/tour/product-tour'

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

  // El viajero tampoco tenía onboarding: llegaba a "Mis compras" vacío sin saber
  // que puede apartar con el mínimo ni qué es el voucher.
  const { data: perfil } = user
    ? await supabase
        .from('profiles' as never)
        .select('onboarded_at, type')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }
  const p = perfil as { onboarded_at: string | null; type: string | null } | null
  const yaVisto = Boolean(p?.onboarded_at)

  // Un cliente que se volvió embajador (o proveedor) conserva estas pantallas
  // — nada aquí lo echa — pero '/' lo manda siempre a su portal. Sin esta
  // salida, quien entra por aquí no tiene cómo volver (b087).
  const portal =
    p?.type === 'embajador'
      ? { href: '/embajador', label: 'Ganancias' }
      : p?.type === 'proveedor'
        ? { href: '/proveedor', label: 'Mis servicios' }
        : null

  return (
    <TravelShell email={user?.email ?? null} logoUrl={logoUrl} portal={portal}>
      {children}
      <ProductTour
        persona="viajero"
        seenKey="ketzal_tour_viajero_v1"
        yaVisto={yaVisto}
      />
    </TravelShell>
  )
}
