'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'

export type ClienteInput = {
  full_name: string
  phone?: string
  email?: string
  doc_id?: string
  notes?: string
}

/** Normaliza los campos del cliente; null si falta el nombre. */
function normalizarCampos(input: ClienteInput) {
  const fullName = input.full_name?.trim()
  if (!fullName) return null
  return {
    full_name: fullName,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    doc_id: input.doc_id?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export async function crearCliente(
  input: ClienteInput
): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Agencia del agente, o null si es agente libre de Ketzal.
  // El acceso lo gobierna el RLS (is_active + dueño/agencia); no exigimos agencia aquí.
  const { data: profile } = await supabase
    .from('profiles')
    .select('supplier_id')
    .eq('id', user.id)
    .single()

  const fields = normalizarCampos(input)
  if (!fields) {
    return { error: 'Escribe el nombre completo del cliente.' }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      supplier_id: profile?.supplier_id ?? null,
      ...fields,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) {
    return { error: safeError(error, 'No se pudo guardar el cliente.') }
  }

  revalidatePath('/clientes')
  redirect(`/clientes/${data.id}?ok=cliente-creado`)
}

export async function actualizarCliente(
  id: string,
  input: ClienteInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fields = normalizarCampos(input)
  if (!fields) {
    return { error: 'Escribe el nombre completo del cliente.' }
  }

  // RLS acota el update a los clientes de la agencia del agente.
  const { error } = await supabase.from('customers').update(fields).eq('id', id)
  if (error) {
    return { error: safeError(error) }
  }

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return { ok: true }
}
