'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ServicioInput = {
  name: string
  supplier_id: string
  description?: string
  price: number
  service_type?: string
  state_from?: string
  city_from?: string
  state_to?: string
  city_to?: string
  max_capacity?: number
  /** Fecha YYYY-MM-DD del input date. */
  available_from?: string
  available_to?: string
  includes?: string[]
  excludes?: string[]
}

/**
 * Convierte una fecha YYYY-MM-DD a ISO anclada al mediodía local
 * (evita el corrimiento de día por zona horaria).
 */
function fechaAIso(fecha?: string): string | null {
  const f = fecha?.trim()
  if (!f) return null
  const parsed = new Date(`${f}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/** Limpia la lista de conceptos: recorta espacios y descarta vacíos. */
function limpiarLineas(lineas?: string[]): string[] {
  return (lineas ?? []).map((linea) => String(linea).trim()).filter(Boolean)
}

/** Normaliza y valida los campos del servicio. */
function normalizarCampos(input: ServicioInput):
  | { error: string }
  | {
      fields: {
        supplier_id: string
        name: string
        description: string | null
        price: number
        service_type: string | null
        state_from: string | null
        city_from: string | null
        state_to: string | null
        city_to: string | null
        max_capacity: number | null
        available_from: string | null
        available_to: string | null
        includes: string[]
        excludes: string[]
      }
    } {
  const name = input.name?.trim()
  if (!name) {
    return { error: 'Escribe el nombre del servicio.' }
  }
  const supplierId = input.supplier_id?.trim()
  if (!supplierId) {
    return { error: 'Selecciona la agencia dueña del servicio.' }
  }
  const price = Number(input.price)
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'El precio debe ser un número mayor o igual a 0.' }
  }

  let maxCapacity: number | null = null
  if (input.max_capacity != null) {
    const cupo = Number(input.max_capacity)
    if (!Number.isFinite(cupo) || cupo < 1) {
      return { error: 'El cupo máximo debe ser un entero mayor a 0.' }
    }
    maxCapacity = Math.trunc(cupo)
  }

  return {
    fields: {
      supplier_id: supplierId,
      name,
      description: input.description?.trim() || null,
      price,
      service_type: input.service_type?.trim() || null,
      state_from: input.state_from?.trim() || null,
      city_from: input.city_from?.trim() || null,
      state_to: input.state_to?.trim() || null,
      city_to: input.city_to?.trim() || null,
      max_capacity: maxCapacity,
      available_from: fechaAIso(input.available_from),
      available_to: fechaAIso(input.available_to),
      includes: limpiarLineas(input.includes),
      excludes: limpiarLineas(input.excludes),
    },
  }
}

export async function crearServicio(
  input: ServicioInput
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = normalizarCampos(input)
  if ('error' in result) return result

  // RLS: superadmin, o supplier_id = my_supplier_id(); si no cumple, el
  // mensaje de permiso denegado se muestra tal cual.
  const { data, error } = await supabase
    .from('services')
    .insert({ ...result.fields, current_bookings: 0 })
    .select('id')
    .single()
  if (error || !data) {
    return { error: error?.message ?? 'No se pudo guardar el servicio.' }
  }

  revalidatePath('/servicios')
  redirect(`/servicios/${data.id}`)
}

export async function actualizarServicio(
  id: string,
  input: ServicioInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = normalizarCampos(input)
  if ('error' in result) return result

  // RLS: superadmin, o la agencia dueña editando su servicio.
  const { error } = await supabase
    .from('services')
    .update(result.fields)
    .eq('id', id)
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/servicios')
  revalidatePath(`/servicios/${id}`)
  return { ok: true }
}

export async function eliminarServicio(
  id: string
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS: superadmin, o la agencia dueña del servicio.
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) {
    const mensaje = error.message.toLowerCase()
    if (
      error.code === '23503' ||
      mensaje.includes('foreign key') ||
      mensaje.includes('violates')
    ) {
      return {
        error: 'No se puede eliminar: este servicio tiene ventas asociadas.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/servicios')
  redirect('/servicios')
}
