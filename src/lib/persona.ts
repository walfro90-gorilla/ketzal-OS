// Persona post-login. Ketzal tiene dos experiencias sobre el mismo auth.users:
//  - agent   → back-office (Ketzal OS): profile de tipo agente/proveedor/embajador.
//  - traveler→ viajero/comprador B2C: su "Ketzal" es su viaje, no el panel de ventas.
// El discriminador es `profiles.type` (b024): 'viajero' → traveler, el resto → agent.
// Sin fila en profiles (comprador que aún vive en marketplace_customers) → traveler.

export type Persona = 'agent' | 'traveler'

/** A dónde aterriza cada persona tras autenticar. */
export function homeForPersona(p: Persona): string {
  return p === 'agent' ? '/dashboard' : '/mis-compras'
}

// ponytail: discriminador = profiles.type, no "existe fila". El viajero ya vive en
// profiles(type='viajero') (F1); proveedor/embajador llegan en F2–F3. Sin profile ⇒
// traveler (defensa: cualquiera sin persona resuelta aterriza en la vista de viajero).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPersona(supabase: any): Promise<Persona> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'traveler'
  const { data } = await supabase
    .from('profiles')
    .select('type')
    .eq('id', user.id)
    .maybeSingle()
  return data && data.type !== 'viajero' ? 'agent' : 'traveler'
}
