import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { homeForPersona } from '@/lib/persona'
import { registrarEvento } from '@/lib/tracker'

// b091: tipos de enlace que Supabase Auth firma con `token_hash`.
const TIPOS_OTP = ['signup', 'email', 'magiclink', 'recovery', 'invite', 'email_change'] as const

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // b091: confirmación por `token_hash` (plantilla de correo con {{ .TokenHash }}):
  // se verifica en el servidor y no depende del navegador donde se pidió el
  // correo — el prospecto se registra en el webview de WhatsApp y confirma desde
  // Gmail sin perder la sesión. PKCE (`?code=`) sigue funcionando igual.
  const tipoOtp = TIPOS_OTP.find((t) => t === searchParams.get('type'))
  const tokenHash = tipoOtp ? searchParams.get('token_hash') : null
  // Solo rutas internas (evita open-redirect vía ?next=//otro-dominio).
  const raw = searchParams.get('next')
  const explicitNext = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
  if (code || tokenHash) {
    const supabase = await createClient()
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: tipoOtp!, token_hash: tokenHash! })
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      // Bitácora (b066): este camino cubre magic link, Google y el enlace de
      // recuperación. El login por contraseña no pasa por aquí: lo registra
      // /api/track/login desde el navegador.
      if (user) await registrarEvento(supabase, user.id, 'login', { via: 'enlace' })
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
