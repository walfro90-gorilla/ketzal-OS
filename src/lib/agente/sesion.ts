import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * El gate del asistente (ADR-0044): sesión + superadmin + el JWT de la cookie
 * con el que corren las herramientas. Lo comparten `/api/agente` y
 * `/api/agente/adjunto`; escalarlo a admins de agencia sigue siendo quitar UNA
 * comparación, ahora en un solo lugar.
 */
export async function sesionAsistente(): Promise<
  | { ok: true; userId: string; email: string | null; nombre: string | null; token: string }
  | { ok: false; respuesta: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, respuesta: NextResponse.json({ error: 'Sin sesión.' }, { status: 401 }) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (supabase as any)
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .maybeSingle()
  if (perfil?.role !== 'superadmin') {
    return { ok: false, respuesta: NextResponse.json({ error: 'Solo el superadmin.' }, { status: 403 }) }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, respuesta: NextResponse.json({ error: 'Sin sesión.' }, { status: 401 }) }
  return { ok: true, userId: user.id, email: user.email ?? null, nombre: perfil.name ?? null, token }
}
