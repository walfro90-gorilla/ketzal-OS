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
      // ¿Ya es viajero? entonces NO lo conviertas en agente: /auth/callback es
      // lo único que llama ensure_profile. Si su profile es type='viajero' lo
      // saltamos y lo mandamos a su viaje (refactor de identidad, F1).
      // profiles.type no está tipado ⇒ cast (convención del repo).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: prof } = user
        ? await db.from('profiles').select('type').eq('id', user.id).maybeSingle()
        : { data: null }
      if (prof?.type === 'viajero') {
        return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('traveler')}`)
      }
      // Garantiza el perfil de Ketzal para cualquier método de login (Google incluido).
      await supabase.rpc('ensure_profile')
      // SaaS: si fue invitado a una agencia (por su email verificado), se une
      // solo a ese equipo con el rol invitado. No-op si no hay invitación o si
      // ya pertenece a una agencia (no arrebata). RPC nuevo ⇒ cast.
      await supabase.rpc('accept_pending_invitation' as never)
      return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('agent')}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
