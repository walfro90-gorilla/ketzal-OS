'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { esBannerValido } from '@/lib/storage/banner-url'

/** Datos de perfil público del proveedor (viven en la columna jsonb `info`). */
export type ProveedorInfo = {
  about?: string
  city_zone?: string
  founded_year?: number
  website?: string
  instagram?: string
  facebook?: string
  specialties?: string[]
}

export type ProveedorInput = {
  name: string
  contact_email: string
  phone_number?: string
  address?: string
  description?: string
  supplier_type: string
  commission_rate?: number
  info?: ProveedorInfo
}

/** Limpia el perfil público: recorta strings, acota año y tags. null si vacío. */
function limpiarInfo(info?: ProveedorInfo): ProveedorInfo | null {
  if (!info) return null
  const out: ProveedorInfo = {}
  const s = (v?: string) => {
    const t = v?.trim()
    return t ? t : undefined
  }
  if (s(info.about)) out.about = s(info.about)
  if (s(info.city_zone)) out.city_zone = s(info.city_zone)
  if (s(info.website)) out.website = s(info.website)
  if (s(info.instagram)) out.instagram = s(info.instagram)
  if (s(info.facebook)) out.facebook = s(info.facebook)
  if (info.founded_year != null && Number.isFinite(info.founded_year)) {
    const y = Math.trunc(info.founded_year)
    if (y >= 1900 && y <= 2100) out.founded_year = y
  }
  const tags = (info.specialties ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8)
  if (tags.length) out.specialties = tags
  return Object.keys(out).length ? out : null
}

/**
 * Normaliza y valida los campos del proveedor.
 * La comisión solo aplica a agencias; para el resto se guarda 0.
 */
function normalizarCampos(input: ProveedorInput):
  | { error: string }
  | {
      fields: {
        name: string
        contact_email: string
        phone_number: string | null
        address: string | null
        description: string | null
        supplier_type: string
        commission_rate: number
        info: ProveedorInfo | null
      }
    } {
  const name = input.name?.trim()
  if (!name) {
    return { error: 'Escribe el nombre del proveedor.' }
  }
  const contactEmail = input.contact_email?.trim()
  if (!contactEmail) {
    return { error: 'Escribe el correo de contacto.' }
  }

  const esAgencia = input.supplier_type === 'agency'
  let rate = 0
  if (esAgencia) {
    rate = Number(input.commission_rate ?? 0)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { error: 'El porcentaje de comisión debe estar entre 0 y 100.' }
    }
  }

  return {
    fields: {
      name,
      contact_email: contactEmail,
      phone_number: input.phone_number?.trim() || null,
      address: input.address?.trim() || null,
      description: input.description?.trim() || null,
      supplier_type: input.supplier_type,
      commission_rate: rate,
      info: limpiarInfo(input.info),
    },
  }
}

export async function crearProveedor(
  input: ProveedorInput
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = normalizarCampos(input)
  if ('error' in result) return result

  // RLS: solo superadmin puede crear proveedores; si no lo es, el mensaje
  // de permiso denegado se muestra tal cual.
  const { data, error } = await supabase
    .from('suppliers')
    .insert(result.fields as never)
    .select('id')
    .single()
  if (error || !data) {
    return { error: safeError(error, 'No se pudo guardar el proveedor.') }
  }

  revalidatePath('/proveedores')
  redirect(`/proveedores/${data.id}?ok=proveedor-creado`)
}

export async function actualizarProveedor(
  id: string,
  input: ProveedorInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = normalizarCampos(input)
  if ('error' in result) return result

  // RLS: superadmin, o el propio proveedor editando su fila.
  const { error } = await supabase
    .from('suppliers')
    .update(result.fields as never)
    .eq('id', id)
  if (error) {
    return { error: safeError(error) }
  }

  revalidatePath('/proveedores')
  revalidatePath(`/proveedores/${id}`)
  return { ok: true }
}

/** Guarda / quita el logo del proveedor (img_logo). URL ya subida a Storage. */
export async function setProveedorLogo(
  id: string,
  url: string | null
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clean = url?.trim() || null
  if (clean && !esBannerValido(clean)) {
    return { error: 'La URL del logo no es válida.' }
  }

  // RLS: superadmin o el propio proveedor editando su fila.
  const { data, error } = await supabase
    .from('suppliers')
    .update({ img_logo: clean } as never)
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: safeError(error, 'No se pudo actualizar el logo o no tienes acceso.'),
    }
  }

  revalidatePath('/proveedores')
  revalidatePath(`/proveedores/${id}`)
  return { ok: true }
}

/** Guarda / reemplaza las fotos del proveedor (photos jsonb, hasta 12). */
export async function setProveedorFotos(
  id: string,
  urls: string[]
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const limpio: string[] = []
  for (const raw of urls ?? []) {
    const u = raw?.trim()
    if (!u) continue
    if (!esBannerValido(u)) return { error: 'Una de las fotos no es válida.' }
    if (!limpio.includes(u)) limpio.push(u)
    if (limpio.length >= 12) break
  }

  const { data, error } = await supabase
    .from('suppliers')
    .update({ photos: limpio.length ? limpio : null } as never)
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: safeError(error, 'No se pudo actualizar las fotos o no tienes acceso.'),
    }
  }

  revalidatePath('/proveedores')
  revalidatePath(`/proveedores/${id}`)
  return { ok: true }
}

export async function eliminarProveedor(
  id: string
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS: solo superadmin puede eliminar proveedores.
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) {
    const mensaje = error.message.toLowerCase()
    if (
      error.code === '23503' ||
      mensaje.includes('foreign key') ||
      mensaje.includes('violates')
    ) {
      return {
        error:
          'No se puede eliminar: este proveedor tiene servicios o ventas asociadas.',
      }
    }
    return { error: safeError(error) }
  }

  revalidatePath('/proveedores')
  redirect('/proveedores?ok=proveedor-eliminado')
}
