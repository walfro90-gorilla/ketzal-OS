'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// C2 — El cliente acepta la política de cancelación desde la cotización
// pública (sin sesión). El RPC accept_policy_by_token (DEFINER, anon,
// fail-closed) congela el snapshot si falta y sella la aceptación UNA sola
// vez; ip/ua van de evidencia en policy_accepted_meta. Archivo aparte para no
// tocar data.ts (convención: acciones nuevas en su propio archivo).

export async function aceptarPoliticaCotizacion(
  token: string,
): Promise<{ error: string } | { ok: true; acceptedAt: string | null }> {
  if (!token) return { error: 'Enlace inválido.' }
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = h.get('user-agent')?.slice(0, 300) || null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_policy_by_token' as never, {
    p_token: token,
    p_meta: { ip, ua },
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar tu aceptación.') }
  if (data == null) return { error: 'La cotización ya no está disponible.' }
  const res = data as unknown as { ok: boolean; accepted_at: string | null }
  return { ok: true, acceptedAt: res.accepted_at }
}
