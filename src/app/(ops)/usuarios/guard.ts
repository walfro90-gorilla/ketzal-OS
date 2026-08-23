import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Puerta de /usuarios: admin de agencia o superadmin. Quien no lo sea recibe 404
// (no "sin acceso"): no revelamos que la sección existe.
//
// El filtro FINO no vive aquí sino en los RPCs (`can_view_user`): el superadmin
// ve todas las cuentas, el admin de agencia sólo las de SU agencia y la propia.
// Esto es sólo la puerta de la sección, no la frontera de seguridad.
export async function assertAdmin() {
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

  if (profile?.role !== 'admin' && profile?.role !== 'superadmin') notFound()
  return { supabase, user, role: profile.role as 'admin' | 'superadmin' }
}
