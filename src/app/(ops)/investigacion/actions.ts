'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { largoDelRango, normalizarOpciones, primerDiaDelMes } from '@/lib/domain/encuesta'
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
  // `mesesDelRango` corta en 24: sin este guard un rango más largo perdía los
  // meses de sobra en silencio y nadie podía votarlos.
  // ponytail: el tope vive solo aquí, no en la BD. No es frontera de seguridad
  // (el peor caso son meses no ofrecidos, y submit_poll_vote sí valida el rango
  // real en SQL); si algún día hace falta blindarlo, va un check en `polls`.
  if (largoDelRango(desde, hasta) > 24) return { error: 'El rango no puede pasar de 24 meses.' }

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

  // El superadmin de plataforma no tiene agencia propia (`supplier_id` NULL),
  // así que el default de columna `my_supplier_id()` no le sirve: tiene que
  // decir de qué agencia es la encuesta. Para un admin de agencia se ignora
  // lo que mande el cliente y manda el default — jamás se crea a nombre ajeno.
  const { data: yo } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const esSuperadmin = yo?.role === 'superadmin'

  if (esSuperadmin && !input.supplier_id) {
    return { error: 'Elige de qué agencia es la encuesta.' }
  }

  const { data, error } = await supabase
    .from('polls' as never)
    .insert({
      question: v.question,
      options: v.options,
      month_from: v.desde,
      month_to: v.hasta,
      closes_at: v.closes_at,
      ...(esSuperadmin ? { supplier_id: input.supplier_id } : {}),
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

  // `.select()` no es cosmético: sin él PostgREST devuelve 204 sin error
  // cuando la RLS filtra las 0 filas, y la acción reportaría `{ok:true}` sobre
  // un cambio que nunca ocurrió.
  const { data: filas, error } = await supabase
    .from('polls' as never)
    .update(cambios as never)
    .eq('id', id)
    .select('id')
  if (error) return { error: safeError(error, 'No se pudo guardar la encuesta.') }
  if (!filas?.length) return { error: 'No tienes permiso para editar esta encuesta.' }

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
    const { data: actual, error: errLeer } = await supabase
      .from('polls' as never)
      .select('options')
      .eq('id', id)
      .single()
    if (errLeer) return { error: safeError(errLeer, 'No se pudo leer la encuesta.') }
    if (!actual) return { error: 'No encontramos esa encuesta.' }
    const opciones = (actual as unknown as { options: unknown[] }).options ?? []
    if (opciones.length < 2) return { error: 'Pon al menos 2 destinos antes de abrirla.' }
  }

  const { data: filas, error } = await supabase
    .from('polls' as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select('id')
  if (error) return { error: safeError(error, 'No se pudo cambiar el estado.') }
  if (!filas?.length) return { error: 'No tienes permiso para cambiar esta encuesta.' }

  revalidatePath('/investigacion')
  revalidatePath(`/investigacion/${id}`)
  return { ok: true }
}
