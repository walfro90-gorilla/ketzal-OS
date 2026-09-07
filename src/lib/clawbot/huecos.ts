import type { createServiceClient } from '@/lib/supabase/service'
import {
  hoyEn,
  oportunidades,
  paraAvisar,
  type Oportunidad,
  type SalidaParaHuecos,
  type ServicioParaHuecos,
} from '@/lib/domain/oportunidades'
import type { Alcance } from '@/lib/domain/temporadas-mx'

/**
 * Emite a la campana los huecos que acaban de entrar a la ventana de
 * anticipación (ADR-0058 §6). Corre en el tick diario del Clawbot; la unicidad
 * de `oportunidades_fecha (supplier_id, clave, anio)` hace que cada hueco se
 * avise UNA vez: si la fila ya existe (emitida, descartada o tomada), no se
 * vuelve a molestar. Idempotente por construcción.
 */
export async function emitirHuecos(
  supabase: ReturnType<typeof createServiceClient>,
  hoy = hoyEn()
): Promise<{ agencias: number; emitidas: number; avisos: number }> {
  const [agRes, svcRes, salRes, opRes, usrRes] = await Promise.all([
    supabase.from('suppliers').select('id,name,alcances_temporada').eq('supplier_type', 'agency'),
    supabase.from('services').select('id,name,supplier_id,duration_days,meses_ideales'),
    supabase.from('service_departures').select('service_id,departs_on').gte('departs_on', hoy),
    supabase.from('oportunidades_fecha' as never).select('supplier_id,clave,anio'),
    // `type` (b024) y `notifications` no están en database.types.ts ⇒ filter/cast.
    supabase.from('profiles').select('id,supplier_id').filter('type', 'eq', 'agente').eq('active', true),
  ])
  for (const r of [agRes, svcRes, salRes, opRes, usrRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  const agencias = (agRes.data ?? []) as unknown as {
    id: string
    name: string
    alcances_temporada: Alcance[] | null
  }[]
  const servicios = (svcRes.data ?? []) as unknown as (ServicioParaHuecos & { supplier_id: string })[]
  const salidas = (salRes.data ?? []) as SalidaParaHuecos[]
  const existentes = new Set(
    ((opRes.data ?? []) as unknown as { supplier_id: string; clave: string; anio: number }[]).map(
      (o) => `${o.supplier_id}|${o.clave}:${o.anio}`
    )
  )
  const usuariosPor = new Map<string, string[]>()
  for (const u of usrRes.data ?? []) {
    if (!u.supplier_id) continue
    usuariosPor.set(u.supplier_id, [...(usuariosPor.get(u.supplier_id) ?? []), u.id])
  }

  let emitidas = 0
  let avisos = 0
  for (const ag of agencias) {
    const propios = servicios.filter((s) => s.supplier_id === ag.id)
    const ids = new Set(propios.map((s) => s.id))
    const nuevas = oportunidades({
      hoy,
      alcances: ag.alcances_temporada ?? ['nacional'],
      servicios: propios,
      salidas: salidas.filter((s) => ids.has(s.service_id)),
    })
      .filter(paraAvisar)
      .filter((o) => !existentes.has(`${ag.id}|${o.id}`))

    for (const o of nuevas) {
      const { error } = await supabase.from('oportunidades_fecha' as never).insert({
        supplier_id: ag.id,
        clave: o.temporada.clave,
        anio: o.anio,
        inicio: o.temporada.inicio,
        fin: o.temporada.fin,
      } as never)
      // 23505 = otra corrida ya la emitió entre el select y el insert: no avisar dos veces.
      if (error) {
        if (error.code === '23505') continue
        throw new Error(error.message)
      }
      emitidas++
      const destinatarios = usuariosPor.get(ag.id) ?? []
      if (!destinatarios.length) continue
      const { error: notiErr } = await supabase
        .from('notifications' as never)
        .insert(destinatarios.map((userId) => notificacion(userId, o)) as never)
      if (notiErr) throw new Error(notiErr.message)
      avisos += destinatarios.length
    }
  }
  return { agencias: agencias.length, emitidas, avisos }
}

function notificacion(userId: string, o: Oportunidad) {
  const t = o.temporada
  const fechas = t.inicio === t.fin ? t.inicio : `${t.inicio} al ${t.fin}`
  return {
    user_id: userId,
    title: `Sin salida: ${t.nombre}`,
    message: `${fechas} · en ${o.diasPara} días. ${t.porque}`,
    metadata: { evento: 'hueco_temporada', oportunidad: o.id },
    action_url: '/salidas#huecos',
  }
}
