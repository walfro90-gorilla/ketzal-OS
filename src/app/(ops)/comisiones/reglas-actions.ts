'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { normalizarCodigoReferido } from '@/lib/domain/embajador'

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
  serviceId: string | null,
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

/**
 * Tarifa GENERAL que una agencia le paga a cualquier embajador que le traiga un
 * viajero (m008 / ADR-0021: paga la agencia dueña del viaje). Es la que cobra
 * el embajador salvo que tenga un trato especial propio.
 *
 * Va sin servicio (`null`) porque aplica a todo el catálogo de esa agencia.
 * Hasta b080 esto NO SE PODÍA GUARDAR: `set_commission_rule` forzaba
 * `scope_profile_id` para todo lo de embajador, así que la tarifa que el
 * resolver busca por agencia no existía en ninguna parte — de ahí que el
 * programa llevara con cero reglas y nadie cobrara.
 */
export async function guardarTarifaEmbajadorAgencia(
  supplierId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<ReglaResult> {
  return guardarRegla('embajador', supplierId, null, basis, value)
}

/** Trato especial de UN embajador para UN servicio. Gana sobre la de su agencia. */
export async function guardarReglaEmbajador(
  embajadorId: string,
  serviceId: string,
  basis: ReglaBasis,
  value: number | null
): Promise<ReglaResult> {
  return guardarRegla('embajador', embajadorId, serviceId, basis, value)
}

/**
 * Tarifa de comisión de un agente por CERRAR una venta (b054): la paga su
 * propia agencia de su margen, no depende del servicio (una sola tarifa por
 * agente, no por-servicio como embajador/plataforma). Base híbrida: %
 * de la venta + fijo por pasajero, ambos a la vez. `null` la quita.
 */
export async function guardarReglaAgente(
  agentId: string,
  pct: number | null,
  porPasajero: number | null
): Promise<ReglaResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (pct == null && porPasajero == null) {
    const { error } = await supabase.rpc('set_commission_rule' as never, {
      p_service: null,
      p_payee_type: 'agente',
      p_scope: agentId,
      p_basis: null,
      p_rate: null,
      p_unit: null,
    } as never)
    if (error) return { error: safeError(error) }
    revalidatePath('/comisiones')
    return { ok: true }
  }

  if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { error: 'El porcentaje debe estar entre 0 y 100.' }
  }
  if (porPasajero == null || !Number.isFinite(porPasajero) || porPasajero < 0) {
    return { error: 'El monto por pasajero debe ser mayor o igual a cero.' }
  }

  const { error } = await supabase.rpc('set_commission_rule' as never, {
    p_service: null,
    p_payee_type: 'agente',
    p_scope: agentId,
    p_basis: 'hibrido',
    p_rate: pct,
    p_unit: porPasajero,
  } as never)
  if (error) return { error: safeError(error) }

  revalidatePath('/comisiones')
  return { ok: true }
}

/**
 * m010: código de referido de un agente. Un agente que comparte el link del
 * marketplace no cobraba nada — `attribute_booking_by_ref` solo resolvía
 * códigos de `type='embajador'`, así que el suyo caía en `referral_misses`
 * como `codigo_inexistente`. Con código, su referido paga la tarifa de
 * embajador de la agencia (ADR-0021: paga quien recluta).
 *
 * `null`/vacío quita el código. La validación de formato se repite en la BD
 * (`ketzal.set_referral_code`): esta es para dar el mensaje bueno sin ir al
 * servidor, la de allá es la que manda.
 */
export async function guardarCodigoReferido(
  profileId: string,
  codigo: string | null
): Promise<ReglaResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const norm = normalizarCodigoReferido(codigo)
  if ('error' in norm) return { error: norm.error }

  const { error } = await supabase.rpc('set_referral_code' as never, {
    p_profile: profileId,
    p_code: norm.code,
  } as never)
  if (error) return { error: safeError(error) }

  revalidatePath('/comisiones')
  return { ok: true }
}
