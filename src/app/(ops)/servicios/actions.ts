'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { limpiarPacks, type PackInput, type Pack } from '@/lib/domain/packs'

export type ItineraryDay = { title: string; description: string }

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
  itinerary?: ItineraryDay[]
  /** Paquetes por ocupación (solo aplica a tours). */
  packs?: PackInput[]
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

/** Limpia el itinerario: recorta y descarta días sin título. */
function limpiarItinerario(dias?: ItineraryDay[]): ItineraryDay[] {
  return (dias ?? [])
    .map((d) => ({
      title: String(d?.title ?? '').trim(),
      description: String(d?.description ?? '').trim(),
    }))
    .filter((d) => d.title !== '')
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
        itinerary: ItineraryDay[]
        packs: Pack[]
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
      itinerary: limpiarItinerario(input.itinerary),
      packs: limpiarPacks(input.packs),
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
  redirect(`/servicios/${data.id}?ok=servicio-creado`)
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

/** Publica / despublica un servicio en el catálogo público (marketplace). */
export async function setServicioPublicado(
  id: string,
  publicado: boolean
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS: solo la agencia dueña (o superadmin) publica su servicio.
  // `published` es columna nueva no tipada aún ⇒ cast (convención multi-agente).
  const { error } = await supabase
    .from('services')
    .update({ published: publicado } as never)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/servicios')
  revalidatePath('/explora')
  revalidatePath(`/servicio/${id}`)
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
  redirect('/servicios?ok=servicio-eliminado')
}

// =============================================================================
// Salidas (inventario por cupo) · tabla service_departures
// -----------------------------------------------------------------------------
// El proveedor declara cuántos lugares hay POR FECHA. El tope se aplica en la
// BD (trigger trg_booking_capacity sobre bookings, en la misma transacción de
// la venta); estas acciones solo administran las salidas. RLS: solo el dueño
// del servicio (o superadmin) las ve/edita.
// =============================================================================

export type SalidaInput = {
  /** Fecha de salida YYYY-MM-DD (columna `date`, sin zona horaria). */
  departs_on: string
  max_capacity: number
  note?: string | null
}

export type Salida = {
  id: string
  departs_on: string
  max_capacity: number
  seats_taken: number
  /** Lugares libres = max_capacity − seats_taken (nunca negativo). */
  remaining: number
  note: string | null
}

/** Hoy en local (YYYY-MM-DD), para no permitir alta de salidas en el pasado. */
function hoyLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Valida y normaliza los campos de una salida. */
function normalizarSalida(
  input: SalidaInput
):
  | { error: string }
  | { fields: { departs_on: string; max_capacity: number; note: string | null } } {
  const fecha = input.departs_on?.trim()
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { error: 'Elige una fecha de salida válida.' }
  }
  // Rechaza fechas inexistentes (p. ej. 2026-02-31) de forma independiente de TZ.
  const parsed = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) {
    return { error: 'Esa fecha no existe.' }
  }
  const cupo = Number(input.max_capacity)
  if (!Number.isInteger(cupo) || cupo < 1) {
    return { error: 'El cupo debe ser un entero mayor a 0.' }
  }
  return {
    fields: { departs_on: fecha, max_capacity: cupo, note: input.note?.trim() || null },
  }
}

/** Lista las salidas de un servicio con sus lugares libres. */
export async function listarSalidas(
  serviceId: string
): Promise<{ error: string } | { salidas: Salida[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('service_departures')
    .select('id, departs_on, max_capacity, seats_taken, note')
    .eq('service_id', serviceId)
    .order('departs_on', { ascending: true })
  if (error) return { error: error.message }

  const salidas: Salida[] = (data ?? []).map((s) => ({
    id: s.id,
    departs_on: s.departs_on,
    max_capacity: s.max_capacity,
    seats_taken: s.seats_taken,
    remaining: Math.max(0, s.max_capacity - s.seats_taken),
    note: s.note ?? null,
  }))
  return { salidas }
}

export async function crearSalida(
  serviceId: string,
  input: SalidaInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const svc = serviceId?.trim()
  if (!svc) return { error: 'Servicio no válido.' }

  const result = normalizarSalida(input)
  if ('error' in result) return result
  if (result.fields.departs_on < hoyLocal()) {
    return { error: 'La fecha de salida no puede ser en el pasado.' }
  }

  // RLS: solo inserta si el servicio es de tu agencia (o superadmin).
  const { error } = await supabase
    .from('service_departures')
    .insert({ service_id: svc, ...result.fields })
  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe una salida para esa fecha en este servicio.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/servicios/${svc}`)
  return { ok: true }
}

export async function actualizarSalida(
  id: string,
  input: SalidaInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = normalizarSalida(input)
  if ('error' in result) return result

  // RLS scope; devuelve service_id para revalidar la página del servicio.
  const { data, error } = await supabase
    .from('service_departures')
    .update(result.fields)
    .eq('id', id)
    .select('service_id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya existe una salida para esa fecha en este servicio.' }
    }
    if (error.code === '23514') {
      // CHECK seats_taken <= max_capacity: no puedes bajar el cupo por debajo
      // de lo ya vendido.
      return { error: 'El cupo no puede quedar por debajo de los lugares ya vendidos.' }
    }
    if (error.code === 'PGRST116') {
      return { error: 'Salida no encontrada o sin acceso.' }
    }
    return { error: error.message }
  }

  if (data?.service_id) revalidatePath(`/servicios/${data.service_id}`)
  return { ok: true }
}

export async function eliminarSalida(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No borrar una salida con lugares vendidos (perdería el conteo del cupo).
  const { data: salida, error: readErr } = await supabase
    .from('service_departures')
    .select('service_id, seats_taken')
    .eq('id', id)
    .single()
  if (readErr || !salida) {
    return { error: 'Salida no encontrada o sin acceso.' }
  }
  if (salida.seats_taken > 0) {
    return {
      error: 'No puedes borrar una salida con ventas. Cancela esas reservas primero.',
    }
  }

  const { error } = await supabase.from('service_departures').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/servicios/${salida.service_id}`)
  return { ok: true }
}
