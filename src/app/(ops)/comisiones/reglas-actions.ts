'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Modo de ganancia por servicio para la plataforma (Ketzal). 'global' = sin regla
// (usa el % global de app_settings / el legacy del resolver).
export type ReglaBasis = 'global' | 'percent' | 'fijo_venta' | 'fijo_pax'

/**
 * Fija (o limpia) la regla de comisión de PLATAFORMA de un servicio: cuánto gana
 * Ketzal por venderlo. Override del % global con un % propio o un monto fijo
 * (por venta o por pasajero). Escribe vía RPC `set_commission_rule` (atómica,
 * con guard superadmin). `basis='global'` limpia el override.
 */
export async function guardarReglaPlataforma(
  serviceId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const p_basis = basis === 'global' ? null : basis
  let p_rate: number | null = null
  let p_unit: number | null = null

  if (basis === 'percent') {
    if (value == null || !Number.isFinite(value) || value < 0 || value > 100) {
      return { error: 'El porcentaje debe estar entre 0 y 100.' }
    }
    p_rate = value
  } else if (basis === 'fijo_venta' || basis === 'fijo_pax') {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      return { error: 'El monto debe ser mayor que cero.' }
    }
    p_unit = value
  }

  const { error } = await supabase.rpc('set_commission_rule' as never, {
    p_service: serviceId,
    p_payee_type: 'plataforma',
    p_scope: null,
    p_basis,
    p_rate,
    p_unit,
  } as never)
  if (error) return { error: safeError(error) }

  revalidatePath('/comisiones')
  return { ok: true }
}
