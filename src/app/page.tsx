import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPersona, homeForPersona } from '@/lib/persona'
import { Landing } from '@/components/marketing/landing'

// `/` tiene doble función: anónimo ve la landing de marca (pitch del OS a la
// agencia); con sesión, resolvemos el aterrizaje por persona (profiles.type):
// agente → back-office, viajero → sus viajes, embajador/proveedor → su portal.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return <Landing />
  redirect(homeForPersona(await getPersona(supabase)))
}
