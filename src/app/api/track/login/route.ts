import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Registra un inicio de sesión en la bitácora (b066).
 *
 * Existe como endpoint y no como llamada directa desde el navegador porque la
 * IP sólo se conoce en el servidor: el cliente no puede decir la suya (y si la
 * dijera, no habría razón para creerle). El navegador sólo avisa "ya entré"; el
 * quién sale de la cookie de sesión y el desde-dónde de las cabeceras.
 *
 * Supabase guarda la IP en `auth.sessions`, pero esa fila se borra al cerrar
 * sesión. Esto es lo que hace que el historial sobreviva.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const h = await headers()
  // Vercel encadena proxies: el primero de la lista es el cliente real.
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null

  // El RPC sólo deja registrar sobre uno mismo (o sobre tu agencia si eres su
  // admin), así que aquí no hace falta más guard. Best-effort: que falle la
  // bitácora nunca debe tumbar un login.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('log_user_event', {
    p_user: user.id,
    p_kind: 'login',
    p_meta: {},
    p_ip: ip,
    p_user_agent: h.get('user-agent'),
  })

  return NextResponse.json({ ok: !error })
}
