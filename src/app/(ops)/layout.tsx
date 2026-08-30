import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/app-shell'
import { getBrandLogo } from '@/lib/brand'

export default async function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Estado del sidebar colapsable (escritorio) leído en el servidor ⇒ sin parpadeo.
  const cookieStore = await cookies()
  const sidebarCollapsed = cookieStore.get('sidebar_collapsed')?.value === '1'

  let displayName: string | null = null
  let role: string | null = null
  let tourYaVisto = false
  // Para la tarjeta del menú de cuenta: quién eres, qué eres y de qué agencia.
  let avatar: string | null = null
  let tipoCuenta: string | null = null
  let agenciaNombre: string | null = null
  if (user) {
    // profiles.type no está tipado (refactor de identidad) ⇒ cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('name, role, type, image, supplier_id, must_change_password, onboarded_at')
      .eq('id', user.id)
      .maybeSingle()
    // Gate de persona de toda la superficie (ops): el back-office no es para el
    // viajero (B2C) ni el embajador (su portal es /embajador). Se discrimina por
    // type. Sin costo extra: el rol ya se leía aquí.
    if (!profile || profile.type === 'viajero') redirect('/mis-compras')
    if (profile.type === 'embajador') redirect('/embajador')
    if (profile.type === 'proveedor') redirect('/proveedor')
    // Cuenta con contraseña provisional (admin recién creado): forzar a crear la
    // suya antes de usar el OS. Se lee fresco de la BD ⇒ sin loop tras limpiarlo.
    if (profile.must_change_password) redirect('/nueva-password')
    displayName = profile.name ?? null
    role = profile.role ?? null
    // m005: la marca del tour vive en el perfil, no en localStorage — antes
    // reaparecía en cada navegador y nadie sabía quién ya lo había visto.
    tourYaVisto = Boolean(profile.onboarded_at)
    avatar = profile.image ?? null
    tipoCuenta = profile.type ?? null
    if (profile.supplier_id) {
      const { data: sup } = await (supabase as any)
        .from('suppliers')
        .select('name')
        .eq('id', profile.supplier_id)
        .maybeSingle()
      agenciaNombre = sup?.name ?? null
    }
  }

  const logoUrl = await getBrandLogo()

  return (
    <AppShell
      email={user?.email ?? null}
      displayName={displayName}
      role={role}
      avatar={avatar}
      tipoCuenta={tipoCuenta}
      agenciaNombre={agenciaNombre}
      tourYaVisto={tourYaVisto}
      logoUrl={logoUrl}
      sidebarCollapsed={sidebarCollapsed}
    >
      {children}
    </AppShell>
  )
}
