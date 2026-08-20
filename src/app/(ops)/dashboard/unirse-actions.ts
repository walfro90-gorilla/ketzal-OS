'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// b065 — Un agente sin agencia solicita entrar a una que ya existe.
//
// La incorporación siempre había ido en un solo sentido: la agencia invita por
// correo (b018). Esto es la dirección contraria, y NO puede ser unilateral: si
// un agente pudiera meterse solo a una agencia vería todas sus ventas, clientes
// y dinero. Es una solicitud que el admin de esa agencia aprueba.
//
// Todos los guards viven en los RPCs (DEFINER); aquí sólo validación de UX.
// RPCs nuevos ⇒ cast `as never` para no tocar database.types.ts.

type Resultado = { error: string } | { ok: true }

export async function solicitarUnirse(
  supplierId: string,
  mensaje?: string
): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!supplierId) return { error: 'Elige una agencia.' }

  const { error } = await supabase.rpc('request_join_agency' as never, {
    p_supplier: supplierId,
    p_mensaje: mensaje?.trim() || null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo enviar la solicitud.') }

  revalidatePath('/dashboard')
  return { ok: true }
}

export async function retirarSolicitud(id: string): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('cancel_join_request' as never, {
    p_id: id,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo retirar la solicitud.') }

  revalidatePath('/dashboard')
  return { ok: true }
}

/** Del lado del admin: aceptar o rechazar una solicitud a su agencia. */
export async function resolverSolicitud(
  id: string,
  aprobar: boolean
): Promise<Resultado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('resolve_join_request' as never, {
    p_id: id,
    p_approve: aprobar,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo resolver la solicitud.') }

  revalidatePath('/equipo')
  revalidatePath('/dashboard')
  return { ok: true }
}
