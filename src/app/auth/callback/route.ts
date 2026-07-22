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
      // ¿Ya es comprador? entonces NO lo conviertas en agente: /auth/callback es
      // lo único que llama ensure_profile, así que aquí lo saltamos para quien ya
      // tiene fila en marketplace_customers y lo mandamos a su viaje.
      // marketplace_customers: tabla no tipada ⇒ cast (convención del repo).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: buyer } = user
        ? await db.from('marketplace_customers').select('id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (buyer) {
        return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('traveler')}`)
      }
      // Garantiza el perfil de Ketzal para cualquier método de login (Google incluido).
      await supabase.rpc('ensure_profile')
      return NextResponse.redirect(`${origin}${explicitNext ?? homeForPersona('agent')}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
