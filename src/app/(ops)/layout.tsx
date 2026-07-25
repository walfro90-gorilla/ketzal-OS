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
  let personaType: string | null = null
  if (user) {
    // profiles.type no está tipado (refactor de identidad) ⇒ cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('name, role, type')
      .eq('id', user.id)
      .maybeSingle()
    // Gate de persona de toda la superficie (ops): el back-office no es para el
    // viajero (B2C) ni el embajador (su portal es /embajador). Se discrimina por
    // type. Sin costo extra: el rol ya se leía aquí.
    if (!profile || profile.type === 'viajero') redirect('/mis-compras')
    if (profile.type === 'embajador') redirect('/embajador')
    if (profile.type === 'proveedor') redirect('/proveedor')
    displayName = profile.name ?? null
    role = profile.role ?? null
    personaType = profile.type ?? null
  }

  const logoUrl = await getBrandLogo()

  return (
    <AppShell
      email={user?.email ?? null}
      displayName={displayName}
      role={role}
      personaType={personaType}
      logoUrl={logoUrl}
      sidebarCollapsed={sidebarCollapsed}
    >
      {children}
    </AppShell>
  )
}
