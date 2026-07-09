'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ProveedorInput = {
  name: string
  contact_email: string
  phone_number?: string
  address?: string
  description?: string
  supplier_type: string
  commission_rate?: number
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
    .insert(result.fields)
    .select('id')
    .single()
  if (error || !data) {
    return { error: error?.message ?? 'No se pudo guardar el proveedor.' }
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
    .update(result.fields)
    .eq('id', id)
  if (error) {
    return { error: error.message }
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
    return { error: error.message }
  }

  revalidatePath('/proveedores')
  redirect('/proveedores?ok=proveedor-eliminado')
}
