// Persona post-login. Ketzal tiene dos experiencias sobre el mismo auth.users:
//  - agent   → back-office (Ketzal OS): tiene fila en `profiles` (rol user/admin/superadmin).
//  - traveler→ viajero/comprador B2C: NO tiene fila en `profiles`, solo en
//              `marketplace_customers`. Su "Ketzal" es su viaje, no el panel de ventas.
// El discriminador es "¿existe fila en profiles?" — coincide con la invariante del
// registro de comprador (email+password bypassa /auth/callback ⇒ nunca nace agente).

export type Persona = 'agent' | 'traveler'

/** A dónde aterriza cada persona tras autenticar. */
export function homeForPersona(p: Persona): string {
  return p === 'agent' ? '/dashboard' : '/mis-compras'
}

// ponytail: discriminador = presencia de fila en profiles. Robusto para el camino
// soportado del comprador (password). Si algún día el comprador entra por magic-link/
// Google, /auth/callback ya evita crearle profile (chequea marketplace_customers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPersona(supabase: any): Promise<Persona> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'traveler'
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  return data ? 'agent' : 'traveler'
}
