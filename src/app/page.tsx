import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPersona, homeForPersona } from '@/lib/persona'

// Resolutor de aterrizaje por persona: agente → back-office, viajero → sus viajes.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  redirect(homeForPersona(await getPersona(supabase)))
}
