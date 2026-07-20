import { cookies } from 'next/headers'
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
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', user.id)
      .single()
    displayName = profile?.name ?? null
    role = profile?.role ?? null
  }

  const logoUrl = await getBrandLogo()

  return (
    <AppShell
      email={user?.email ?? null}
      displayName={displayName}
      role={role}
      logoUrl={logoUrl}
      sidebarCollapsed={sidebarCollapsed}
    >
      {children}
    </AppShell>
  )
}
