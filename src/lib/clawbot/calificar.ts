import type { createServiceClient } from '@/lib/supabase/service'
import { hoyEn } from '@/lib/domain/oportunidades'
import { sumarDias } from '@/lib/domain/temporadas-mx'

/**
 * Recordatorio de calificar: al día siguiente del viaje, el viajero recibe en
 * su campana "¿Cómo estuvo tu viaje?" con link al detalle, que es donde vive la
 * calificación (b102). Una sola vez por pedido: si ya hay aviso o ya calificó,
 * no se repite. Corre en el tick diario del Clawbot.
 */

/** Ventana de fechas de viaje que se revisa hoy: ayer y dos días más atrás, por si el tick falló un día. */
export function ventanaCalificar(hoy: string): { desde: string; hasta: string } {
  return { desde: sumarDias(hoy, -3), hasta: sumarDias(hoy, -1) }
}

export type ViajeTerminado = { id: string; marketplace_customer_id: string; service_name: string }

/** La fila de `notifications` que se le manda al viajero. */
export function avisoCalificar(v: ViajeTerminado) {
  return {
    user_id: v.marketplace_customer_id,
    title: '¿Cómo estuvo tu viaje?',
    message: `Cuéntanos cómo te fue en ${v.service_name}. Tu reseña le sirve a la agencia y a quien viaja después.`,
    metadata: { evento: 'calificar', booking_id: v.id },
    action_url: `/mis-compras/${v.id}`,
  }
}

export async function recordarCalificar(
  supabase: ReturnType<typeof createServiceClient>,
  hoy = hoyEn()
): Promise<{ revisados: number; avisos: number }> {
  const { desde, hasta } = ventanaCalificar(hoy)
  const { data, error } = await supabase
    .from('bookings')
    .select('id, marketplace_customer_id, travel_date, services(name)')
    .eq('status', 'paid')
    .eq('channel' as never, 'portal' as never)
    .not('marketplace_customer_id', 'is', null)
    .gte('travel_date', desde)
    .lte('travel_date', hasta)
  if (error) throw new Error(error.message)
  const viajes = ((data ?? []) as unknown as {
    id: string
    marketplace_customer_id: string
    services: { name: string } | { name: string }[] | null
  }[]).map((b) => ({
    id: b.id,
    marketplace_customer_id: b.marketplace_customer_id,
    service_name: (Array.isArray(b.services) ? b.services[0]?.name : b.services?.name) ?? 'tu viaje',
  }))
  if (!viajes.length) return { revisados: 0, avisos: 0 }

  const ids = viajes.map((v) => v.id)
  const [avisados, calificados] = await Promise.all([
    supabase
      .from('notifications' as never)
      .select('metadata')
      .eq('metadata->>evento' as never, 'calificar' as never)
      .in('metadata->>booking_id' as never, ids as never),
    supabase
      .from('ratings' as never)
      .select('booking_id')
      .eq('kind' as never, 'traveler_to_provider' as never)
      .in('booking_id' as never, ids as never),
  ])
  if (avisados.error) throw new Error(avisados.error.message)
  if (calificados.error) throw new Error(calificados.error.message)
  const ya = new Set<string>([
    ...((avisados.data ?? []) as unknown as { metadata: { booking_id?: string } }[]).map((n) => n.metadata?.booking_id ?? ''),
    ...((calificados.data ?? []) as unknown as { booking_id: string }[]).map((r) => r.booking_id),
  ])
  const pendientes = viajes.filter((v) => !ya.has(v.id))
  if (pendientes.length) {
    const { error: e } = await supabase
      .from('notifications' as never)
      .insert(pendientes.map(avisoCalificar) as never)
    if (e) throw new Error(e.message)
  }
  return { revisados: viajes.length, avisos: pendientes.length }
}
