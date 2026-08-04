import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarState, mpOauthConfigured } from '@/lib/mp-oauth'

// b053: inicia el OAuth de Mercado Pago para conectar la cuenta MP de una
// agencia. Guard: superadmin o admin de ESA agencia (con sesión). El supplier
// viaja firmado en `state` — el callback no acepta ids arbitrarios.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const supplierId = url.searchParams.get('supplier')
  if (!supplierId) {
    return NextResponse.json({ error: 'Falta supplier' }, { status: 400 })
  }
  if (!mpOauthConfigured()) {
    return NextResponse.json(
      { error: 'Configura MP_CLIENT_ID y MP_CLIENT_SECRET en Vercel para habilitar la conexión.' },
      { status: 501 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', url.origin))

  // Guard vía RPC existente (superadmin o admin activo de esa agencia).
  const { data: esAdmin } = await supabase.rpc('is_agency_admin' as never, {
    p_supplier: supplierId,
  } as never)
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!esAdmin && perfil?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
  const redirectUri = `${origin}/api/mp/oauth/callback`
  const auth = new URL('https://auth.mercadopago.com.mx/authorization')
  auth.searchParams.set('client_id', process.env.MP_CLIENT_ID!)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('platform_id', 'mp')
  auth.searchParams.set('state', firmarState(supplierId))
  auth.searchParams.set('redirect_uri', redirectUri)
  return NextResponse.redirect(auth)
}
