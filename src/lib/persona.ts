// Persona post-login. Varias experiencias sobre el mismo auth.users, discriminadas
// por `profiles.type` (b024, refactor de identidad):
//  - agent      → back-office (Ketzal OS): profile agente/admin.
//  - traveler   → viajero/comprador B2C: su "Ketzal" es su viaje.
//  - ambassador → embajador: su portal de ganancias + link de referido.
//  - provider   → proveedor: su portal read-only de servicios donde participa.
// Sin fila en profiles ⇒ traveler (defensa).

export type Persona = 'agent' | 'traveler' | 'ambassador' | 'provider'

/** A dónde aterriza cada persona tras autenticar. */
export function homeForPersona(p: Persona): string {
  if (p === 'traveler') return '/mis-compras'
  if (p === 'ambassador') return '/embajador'
  if (p === 'provider') return '/proveedor'
  return '/dashboard'
}

// ponytail: discriminador = profiles.type, no "existe fila". viajero (F1), embajador
// (F2) y proveedor (F3) ya viven en profiles. Sin profile ⇒ traveler.
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
  const t = data?.type
  if (t === 'viajero') return 'traveler'
  if (t === 'embajador') return 'ambassador'
  if (t === 'proveedor') return 'provider'
  return 'agent'
}
