import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Puerta de las páginas de /viajeros: solo god admin. Un no-superadmin recibe
// 404 (no "sin acceso"): no revelamos que la sección existe. El proxy ya exige
// sesión; esto añade el filtro de rol.
export async function assertSuperadmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') notFound()
  return { supabase, user }
}
