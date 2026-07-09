import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/app-shell'

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
    <AppShell email={user?.email ?? null} displayName={displayName}>
      {children}
    </AppShell>
  )
}
