'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { normalizarOpciones, primerDiaDelMes } from '@/lib/domain/encuesta'
import type { EncuestaInput, PollStatus } from './tipos'

// Investigación de mercado (m002). `polls` NO es tabla de dinero ni append-only,
// así que la escritura va directo por RLS (`polls_admin_ins/upd` con
// is_agency_admin) en vez de inventar RPCs de CRUD. `supplier_id` lo pone el
// default de la columna (my_supplier_id()), nunca el cliente.
// Los votos sí son RPC-only-write: se escriben desde /opina con submit_poll_vote.

type Validado = {
  question: string
  options: { id: number; label: string }[]
  desde: string
  hasta: string
  closes_at: string | null
}

function validar(input: EncuestaInput): { error: string } | Validado {
  const question = input.question?.trim()
  if (!question) return { error: 'Escribe la pregunta de la encuesta.' }
  if (question.length > 200) return { error: 'La pregunta es demasiado larga (200 máx).' }

  const options = normalizarOpciones(input.options ?? [])
  if (options.length < 2) return { error: 'Pon al menos 2 destinos para elegir.' }

  const desde = primerDiaDelMes(input.month_from ?? '')
  const hasta = primerDiaDelMes(input.month_to ?? '')
  if (!desde || !hasta) return { error: 'Elige el rango de meses.' }
  if (desde > hasta) return { error: 'El mes inicial no puede ser posterior al final.' }

  return { question, options, desde, hasta, closes_at: input.closes_at || null }
}

export async function crearEncuesta(
  input: EncuestaInput,
): Promise<{ error: string } | { ok: true; id: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const v = validar(input)
  if ('error' in v) return v

  const { data, error } = await supabase
    .from('polls' as never)
    .insert({
      question: v.question,
      options: v.options,
      month_from: v.desde,
      month_to: v.hasta,
      closes_at: v.closes_at,
    } as never)
    .select('id')
    .single()

  if (error) return { error: safeError(error, 'No se pudo crear la encuesta.') }
  revalidatePath('/investigacion')
  return { ok: true, id: (data as unknown as { id: string }).id }
}

export async function editarEncuesta(
  id: string,
  input: EncuestaInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const v = validar(input)
  if ('error' in v) return v

  const { data: actual, error: errLeer } = await supabase
    .from('polls' as never)
    .select('status')
    .eq('id', id)
    .single()
  if (errLeer || !actual) return { error: 'No encontramos esa encuesta.' }

  // Cambiar destinos o meses con la encuesta ya publicada invalidaría los votos
  // emitidos: solo la pregunta y la fecha de cierre siguen editables.
  const enBorrador = (actual as unknown as { status: PollStatus }).status === 'draft'
  const cambios = enBorrador
    ? {
        question: v.question,
        options: v.options,
        month_from: v.desde,
        month_to: v.hasta,
        closes_at: v.closes_at,
        updated_at: new Date().toISOString(),
      }
    : { question: v.question, closes_at: v.closes_at, updated_at: new Date().toISOString() }

  const { error } = await supabase
    .from('polls' as never)
    .update(cambios as never)
    .eq('id', id)
  if (error) return { error: safeError(error, 'No se pudo guardar la encuesta.') }

  revalidatePath('/investigacion')
  revalidatePath(`/investigacion/${id}`)
  return { ok: true }
}

export async function cambiarEstadoEncuesta(
  id: string,
  status: PollStatus,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (status === 'draft') return { error: 'Una encuesta publicada no vuelve a borrador.' }

  if (status === 'open') {
    const { data: actual } = await supabase
      .from('polls' as never)
      .select('options')
      .eq('id', id)
      .single()
    const opciones = (actual as unknown as { options: unknown[] } | null)?.options ?? []
    if (opciones.length < 2) return { error: 'Pon al menos 2 destinos antes de abrirla.' }
  }

  const { error } = await supabase
    .from('polls' as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
  if (error) return { error: safeError(error, 'No se pudo cambiar el estado.') }

  revalidatePath('/investigacion')
  revalidatePath(`/investigacion/${id}`)
  return { ok: true }
}
