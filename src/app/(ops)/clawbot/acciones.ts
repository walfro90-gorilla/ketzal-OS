'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Los RPCs `clawbot_*` aún no están en los tipos generados a mano
// (otro flujo edita database.types.ts en paralelo); cast puntual del
// nombre y args, mismo patrón que src/app/(ops)/cobranza/data.ts.

/** Marca un recordatorio como enviado (el agente ya lo mandó por WhatsApp). */
export async function marcarEnviado(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc(
    'clawbot_marcar_enviado' as never,
    { p_id: id } as never
  )
  if (error) return { error: error.message }

  revalidatePath('/clawbot')
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Descarta un recordatorio sin enviarlo (no aplica o ya se atendió por otro canal). */
export async function descartarRecordatorio(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc(
    'clawbot_descartar' as never,
    { p_id: id } as never
  )
  if (error) return { error: error.message }

  revalidatePath('/clawbot')
  revalidatePath('/dashboard')
  return { ok: true }
}
