'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'

// Genera un magic-link de acceso para un embajador. El superadmin lo COPIA y lo
// manda por WhatsApp (no depende de que el correo sea real/entregable: el link se
// comparte a mano). Al abrirlo, /auth/callback rutea por type='embajador' → /embajador.

/**
 * Puede generar el acceso el superadmin, o el admin de la agencia dueña del
 * embajador (m005: quien recluta también entrega el acceso, si no cada alta
 * vuelve a pasar por el fundador).
 */
async function requirePuedeDarAcceso(
  embajadorId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, supplier_id')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'superadmin') return { ok: true }

  if (profile?.role === 'admin' && profile.supplier_id) {
    // Se pregunta por RLS (no con service role): `profiles_embajadores_de_mi_agencia`
    // solo devuelve fila si el embajador es de su agencia.
    // `type` no está en database.types.ts (archivo con un solo dueño) ⇒ cast.
    const { data: emb } = await supabase
      .from('profiles' as never)
      .select('id')
      .eq('id', embajadorId)
      .eq('type', 'embajador')
      .eq('supplier_id', profile.supplier_id)
      .maybeSingle()
    if (emb) return { ok: true }
  }
  return { error: 'Solo el administrador de su agencia puede generar el acceso.' }
}

export async function generarAccesoEmbajador(
  embajadorId: string
): Promise<{ error: string } | { link: string }> {
  if (!embajadorId) return { error: 'Falta el embajador.' }
  const gate = await requirePuedeDarAcceso(embajadorId)
  if ('error' in gate) return gate

  const svc = createServiceClient()
  // Service role: leer el correo del embajador (RLS de profiles no lo expone).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (svc as any)
    .from('profiles')
    .select('email, type')
    .eq('id', embajadorId)
    .maybeSingle()
  if (!prof || prof.type !== 'embajador' || !prof.email) {
    return { error: 'Embajador no válido.' }
  }

  const h = await headers()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${h.get('host')}`
  const { data, error } = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: prof.email,
    options: { redirectTo: `${origin}/auth/callback` },
  })
  const link = data?.properties?.action_link
  if (error || !link) {
    return { error: safeError(error, 'No se pudo generar el link de acceso.') }
  }
  return { link }
}
