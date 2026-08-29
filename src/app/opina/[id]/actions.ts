'use server'

import { createHash, randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { primerDiaDelMes } from '@/lib/domain/encuesta'

// m002 — Voto anónimo en la encuesta pública (sin sesión). El RPC
// submit_poll_vote (DEFINER, anon, fail-closed) valida encuesta abierta,
// opción y mes, y deduplica por voter_hash. Calco de politica-actions.ts.

const COOKIE_VOTANTE = 'kz_voter'
const ANIO = 60 * 60 * 24 * 365

/** Cookie de votante: identidad opaca y estable del navegador, creada al primer voto. */
async function idDeVotante(): Promise<string> {
  const jar = await cookies()
  const previo = jar.get(COOKIE_VOTANTE)?.value
  if (previo) return previo
  const nuevo = randomUUID()
  jar.set(COOKIE_VOTANTE, nuevo, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ANIO,
    path: '/opina',
  })
  return nuevo
}

export async function votarEncuesta(input: {
  pollId: string
  optionId: number
  month: string
  suggestion?: string
  contact?: string
  utm?: Record<string, string>
}): Promise<{ error: string } | { ok: true; yaVotaste: boolean }> {
  const { pollId, optionId, month } = input
  if (!pollId || !Number.isInteger(optionId) || !month) {
    return { error: 'Falta elegir destino y mes.' }
  }
  const mes = primerDiaDelMes(month)
  if (!mes) return { error: 'El mes elegido no es válido.' }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = h.get('user-agent')?.slice(0, 300) || null

  // El hash es la identidad del votante para el dedupe: la cookie sola se borra,
  // la IP sola castiga a familias tras un mismo NAT. Nunca guardamos la cookie cruda.
  const voterHash = createHash('sha256')
    .update(`${await idDeVotante()}|${ip ?? ''}|${ua ?? ''}`)
    .digest('hex')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_poll_vote' as never, {
    p_poll: pollId,
    p_option: optionId,
    p_month: mes,
    p_voter_hash: voterHash,
    p_suggestion: input.suggestion?.slice(0, 280) || null,
    p_contact: input.contact?.slice(0, 120) || null,
    p_meta: { ip, ua, ...(input.utm ?? {}) },
  } as never)

  if (error) return { error: safeError(error, 'No se pudo registrar tu voto.') }
  if (data == null) return { error: 'Esta encuesta ya no está recibiendo votos.' }

  const res = data as unknown as { ok: boolean; ya_votaste: boolean }
  // Marca de "ya votó" para que la página pinte resultados en la siguiente carga.
  const jar = await cookies()
  jar.set(`kz_voted_${pollId}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ANIO,
    path: '/opina',
  })
  return { ok: true, yaVotaste: res.ya_votaste }
}
