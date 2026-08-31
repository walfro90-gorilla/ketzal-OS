'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { emitirCredencialProvisional } from '@/lib/auth/credenciales'

// Reemite el acceso de un embajador: contraseña provisional nueva que el
// reclutador le pasa por WhatsApp o correo. Sustituye al magic-link, que nunca
// funcionó (el porqué, medido, en `lib/auth/credenciales.ts`).

/**
 * Puede entregar el acceso el superadmin, o el admin de la agencia dueña del
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
  return { error: 'Solo el administrador de su agencia puede entregar el acceso.' }
}

export async function regenerarAccesoEmbajador(embajadorId: string): Promise<
  | { error: string }
  | { ok: true; credentials: { email: string; password: string }; telefono: string | null }
> {
  if (!embajadorId) return { error: 'Falta el embajador.' }
  const gate = await requirePuedeDarAcceso(embajadorId)
  if ('error' in gate) return gate

  // Que sea embajador se confirma con service role: la RLS de profiles no
  // expone la fila al superadmin por el mismo camino que al admin de agencia, y
  // sin esta comprobación el gate del superadmin dejaría reemitir la contraseña
  // de CUALQUIER cuenta desde una pantalla de embajadores.
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (svc as any)
    .from('profiles')
    .select('type, phone')
    .eq('id', embajadorId)
    .maybeSingle()
  if (prof?.type !== 'embajador') return { error: 'Esa cuenta no es de un embajador.' }

  const res = await emitirCredencialProvisional(embajadorId)
  if ('error' in res) return res

  revalidatePath('/comisiones')
  return { ok: true, credentials: res.credentials, telefono: prof.phone ?? null }
}
