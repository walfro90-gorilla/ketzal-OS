'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Registrar el pago de un corte. Va por `pagar_corte_embajador` (b086b) y no
// por `create_expense`, que solo sabe pagarle a un PROVEEDOR y no tiene cómo
// pagarle a una persona (`provider_profile_id`, el riel de b081/ADR-0030).
//
// El guard del monto vive en la BD, contra el MISMO corte que se pinta en
// pantalla: así la UI y la base no pueden discrepar, y pagar de más —que dejaría
// el saldo del embajador en negativo sin que nadie se entere hasta que reclame—
// se rechaza con el número correcto en el mensaje.

export async function registrarPagoCorte(input: {
  embajadorId: string
  /** Null = el bono por reclutar, que lo paga Ketzal y no una agencia. */
  agenciaId: string | null
  monto: number
  /** Fecha del corte (`YYYY-MM-DD`). */
  fecha: string
  metodo?: string
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión.' }

  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { error: 'El monto debe ser mayor que cero.' }
  }

  const { error } = await supabase.rpc('pagar_corte_embajador' as never, {
    p_embajador: input.embajadorId,
    p_agencia: input.agenciaId,
    p_monto: input.monto,
    p_fecha: input.fecha,
    p_metodo: input.metodo ?? 'transferencia',
  } as never)
  if (error) return { error: safeError(error, 'No se pudo registrar el pago.') }

  revalidatePath('/comisiones')
  revalidatePath('/gastos')
  return { ok: true }
}
