import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSistema } from '@/lib/system-log'
import { verificarState } from '@/lib/mp-oauth'

// b053: callback del OAuth de MP. Intercambia el code por los tokens del
// vendedor y los guarda en mp_accounts (tabla deny-all, solo service_role).
// El supplier viene FIRMADO en state — un state alterado se rechaza.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const supplierId = verificarState(url.searchParams.get('state'))
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
  const volver = (msg: string) =>
    NextResponse.redirect(`${origin}/proveedores/${supplierId ?? ''}?mp=${msg}`)

  if (!supplierId) {
    return NextResponse.redirect(`${origin}/proveedores?mp=state-invalido`)
  }
  if (!code) return volver('cancelado')

  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin}/api/mp/oauth/callback`,
    }),
  })
  const body = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    public_key?: string
    user_id?: number | string
    live_mode?: boolean
    expires_in?: number
  }

  const svc = createServiceClient()
  if (!res.ok || !body.access_token || body.user_id == null) {
    await logSistema(svc, 'mp_oauth', 'error', 'intercambio de code falló', {
      supplierId,
      http: res.status,
    })
    return volver('error')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).from('mp_accounts').upsert({
    supplier_id: supplierId,
    mp_user_id: String(body.user_id),
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    public_key: body.public_key ?? null,
    live_mode: body.live_mode ?? true,
    expires_at: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    await logSistema(svc, 'mp_oauth', 'error', 'no se pudo guardar mp_account', {
      supplierId,
      message: error.message,
    })
    return volver('error')
  }

  await logSistema(svc, 'mp_oauth', 'info', 'cuenta MP conectada', {
    supplierId,
    mp_user_id: String(body.user_id),
  })
  return volver('conectado')
}
