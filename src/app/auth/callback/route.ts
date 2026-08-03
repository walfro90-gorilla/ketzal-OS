import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { homeForPersona } from '@/lib/persona'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Solo rutas internas (evita open-redirect vía ?next=//otro-dominio).
  const raw = searchParams.get('next')
  const explicitNext = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      // Ruteo por persona (profiles.type). Viajero/embajador tienen su propia
      // superficie y NO deben pasar por ensure_profile (no nacen agente). Solo el
      // agente (o un usuario nuevo sin profile) sigue al flujo de back-office.
      // profiles.type no está tipado ⇒ cast (convención del repo).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: prof } = user
        ? await db.from('profiles').select('type').eq('id', user.id).maybeSingle()
        : { data: null }
      if (prof?.type === 'viajero') {
        return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('traveler')}`)
      }
      if (prof?.type === 'embajador') {
        return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('ambassador')}`)
      }
      if (prof?.type === 'proveedor') {
        return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('provider')}`)
      }
      // Garantiza el perfil de Ketzal para cualquier método de login (Google
      // incluido). Todo usuario nuevo nace VIAJERO (b032); solo se vuelve agente
      // si acepta una invitación de agencia (abajo).
      await supabase.rpc('ensure_profile')
      // SaaS: si fue invitado a una agencia (por su email verificado), se une
      // solo a ese equipo con el rol invitado y pasa a type='agente'. No-op si no
      // hay invitación o si ya pertenece a una agencia (no arrebata). RPC ⇒ cast.
      await supabase.rpc('accept_pending_invitation' as never)
      // Rutea a la superficie correcta: un signup nuevo sin invitación es viajero
      // (→ /mis-compras); uno invitado ya es agente (→ /dashboard).
      const prof2 = user
        ? (await db.from('profiles').select('type').eq('id', user.id).maybeSingle())
            .data
        : null
      const persona =
        prof2?.type === 'viajero'
          ? 'traveler'
          : prof2?.type === 'embajador'
            ? 'ambassador'
            : prof2?.type === 'proveedor'
              ? 'provider'
              : 'agent'
      return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona(persona)}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
