'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeError } from '@/lib/errors'
import { temporadaPorId } from '@/lib/domain/oportunidades'
import { etiquetaLugar } from '@/lib/domain/mexico'
import { completar, LlmError } from '@/lib/agente/llm'
import { fmtFechaSalida } from './tipos'

/**
 * Acciones del calendario de huecos (ADR-0058). Todas escriben en
 * `oportunidades_fecha` con el cliente del usuario: la RLS decide si la fila es
 * de su agencia. La tabla no está en `database.types.ts` (un solo dueño) ⇒ casts.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

async function miAgencia(supabase: Cliente): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data } = await supabase
    .from('profiles')
    .select('supplier_id')
    .eq('id', user.id)
    .maybeSingle()
  return data?.supplier_id ?? null
}

function filaBase(id: string, supplierId: string) {
  const temporada = temporadaPorId(id)
  if (!temporada) return null
  return {
    temporada,
    fila: {
      supplier_id: supplierId,
      clave: temporada.clave,
      anio: Number(temporada.inicio.slice(0, 4)),
      inicio: temporada.inicio,
      fin: temporada.fin,
    },
  }
}

async function upsertHueco(
  supabase: Cliente,
  fila: Record<string, unknown>
): Promise<{ error: string } | { ok: true }> {
  const { error } = await supabase
    .from('oportunidades_fecha' as never)
    .upsert(fila as never, { onConflict: 'supplier_id,clave,anio' })
  if (error) return { error: safeError(error, 'No se pudo guardar.') }
  revalidatePath('/salidas')
  return { ok: true }
}

/** Apaga esa temporada para esta agencia este año. Queda en el historial. */
export async function descartarHueco(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const supplierId = await miAgencia(supabase)
  if (!supplierId) return { error: 'Tu usuario no tiene agencia.' }
  const f = filaBase(id, supplierId)
  if (!f) return { error: 'Temporada no válida.' }
  return upsertHueco(supabase, { ...f.fila, descartada_at: new Date().toISOString() })
}

/** Deshace un descarte (clic equivocado). */
export async function reactivarHueco(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const supplierId = await miAgencia(supabase)
  if (!supplierId) return { error: 'Tu usuario no tiene agencia.' }
  const f = filaBase(id, supplierId)
  if (!f) return { error: 'Temporada no válida.' }
  return upsertHueco(supabase, { ...f.fila, descartada_at: null })
}

type ServicioCtx = {
  id: string
  name: string
  city_to: string | null
  state_to: string | null
  country_to: string | null
  duration_days: number | null
  meses_ideales: number[] | null
  price: number | null
  published: boolean
}

/**
 * "¿Qué ofrezco?": la IA redacta con el catálogo real de la agencia, la
 * temporada y cuántas ventas lleva cada servicio. Se guarda por
 * (agencia, temporada, año) para no pagar dos veces (ADR-0058 §7).
 */
export async function queOfrezco(id: string): Promise<{ error: string } | { texto: string }> {
  const supabase = await createClient()
  const supplierId = await miAgencia(supabase)
  if (!supplierId) return { error: 'Tu usuario no tiene agencia.' }
  const f = filaBase(id, supplierId)
  if (!f) return { error: 'Temporada no válida.' }
  const { temporada: t, fila } = f

  const { data: previa } = await supabase
    .from('oportunidades_fecha' as never)
    .select('texto_ia')
    .eq('supplier_id', supplierId)
    .eq('clave', fila.clave)
    .eq('anio', fila.anio)
    .maybeSingle()
  const guardado = (previa as { texto_ia?: string | null } | null)?.texto_ia
  if (guardado) return { texto: guardado }

  const [agenciaRes, serviciosRes, ventasRes] = await Promise.all([
    supabase.from('suppliers').select('name').eq('id', supplierId).maybeSingle(),
    supabase
      .from('services')
      .select('id,name,city_to,state_to,country_to,duration_days,meses_ideales,price,published')
      .eq('supplier_id', supplierId),
    // ponytail: conteo simple de ventas por servicio; cuando haya historial de
    // años se cruza con travel_date por temporada.
    supabase.from('bookings').select('service_id').neq('status', 'cancelled').limit(5000),
  ])
  const servicios = (serviciosRes.data ?? []) as unknown as ServicioCtx[]
  const ventas = new Map<string, number>()
  for (const b of ventasRes.data ?? []) {
    if (b.service_id) ventas.set(b.service_id, (ventas.get(b.service_id) ?? 0) + 1)
  }

  const catalogo = servicios
    .map((s) => {
      const destino = etiquetaLugar(s.city_to, s.state_to, s.country_to) || 'sin destino'
      const meses = s.meses_ideales?.length ? `meses ideales ${s.meses_ideales.join(',')}` : 'todo el año'
      return `- ${s.name} → ${destino}; ${s.duration_days ?? 1} día(s); desde $${s.price ?? 0} MXN; ${meses}; ${ventas.get(s.id) ?? 0} ventas; ${s.published ? 'publicado' : 'borrador'}`
    })
    .join('\n')

  const rango = t.inicio === t.fin ? fmtFechaSalida(t.inicio) : `${fmtFechaSalida(t.inicio)} al ${fmtFechaSalida(t.fin)}`
  try {
    const { mensaje } = await completar(
      [
        {
          role: 'system',
          content:
            'Eres el asesor comercial de una agencia de viajes de Ciudad Juárez, Chihuahua, México. ' +
            'Respondes en español de México, directo, sin saludos. Máximo 120 palabras en tres viñetas: ' +
            '(1) qué servicio del catálogo ofrecer y por qué esa fecha, (2) cómo empaquetarlo (duración, precio, gancho), ' +
            '(3) cuándo publicarlo y por dónde. Solo usa servicios que estén en el catálogo; si ninguno encaja, dilo y sugiere el más cercano.',
        },
        {
          role: 'user',
          content:
            `Agencia: ${agenciaRes.data?.name ?? 'mi agencia'}\n` +
            `Temporada sin salida: ${t.nombre} (${rango}). ${t.porque}\n` +
            `Catálogo:\n${catalogo || '- (vacío)'}`,
        },
      ],
      []
    )
    const texto = mensaje.content?.trim()
    if (!texto) return { error: 'El asistente no devolvió texto.' }
    const r = await upsertHueco(supabase, { ...fila, texto_ia: texto, texto_ia_at: new Date().toISOString() })
    if ('error' in r) return r
    return { texto }
  } catch (e) {
    if (e instanceof LlmError) return { error: e.message }
    return { error: 'No se pudo consultar al asistente.' }
  }
}
