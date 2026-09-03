import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPersona, homeForPersona } from '@/lib/persona'
import { Landing } from '@/components/marketing/landing'

// `/` tiene doble función: anónimo ve la landing de marca (pitch del OS a la
// agencia); con sesión, resolvemos el aterrizaje por persona (profiles.type):
// agente → back-office, viajero → sus viajes, embajador/proveedor → su portal.
// Canonical al apex: os.ketzal.tours sirve la misma landing y no debe indexarse
// como copia (ADR-0026).
export const metadata: Metadata = { alternates: { canonical: '/' } }

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return <Landing />
  redirect(homeForPersona(await getPersona(supabase)))
}
