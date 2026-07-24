'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

// Modo de comisión por servicio. 'global' = sin regla (para plataforma usa el %
// global de app_settings; para embajador significa "sin tarifa" ⇒ no atribuye).
export type ReglaBasis = 'global' | 'percent' | 'fijo_venta' | 'fijo_pax'

type ReglaResult = { error: string } | { ok: true }

/**
 * Alta/edición/limpieza de una regla de comisión por servicio vía la RPC
 * `set_commission_rule` (atómica, con guard). Compartida por los editores de
 * plataforma y de embajador. `basis='global'` limpia la regla (p_basis=null).
 */
async function guardarRegla(
  payeeType: 'plataforma' | 'embajador',
  scope: string | null,
  serviceId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<ReglaResult> {
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
    p_payee_type: payeeType,
    p_scope: scope,
    p_basis,
    p_rate,
    p_unit,
  } as never)
  if (error) return { error: safeError(error) }

  revalidatePath('/comisiones')
  return { ok: true }
}

/** Cuánto gana Ketzal (plataforma) por vender un servicio. 'global' = usa el % global. */
export async function guardarReglaPlataforma(
  serviceId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<ReglaResult> {
  return guardarRegla('plataforma', null, serviceId, basis, value)
}

/** Cuánto cobra un embajador por vender un servicio. 'global' = sin tarifa (no atribuye). */
export async function guardarReglaEmbajador(
  embajadorId: string,
  serviceId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<ReglaResult> {
  return guardarRegla('embajador', embajadorId, serviceId, basis, value)
}
