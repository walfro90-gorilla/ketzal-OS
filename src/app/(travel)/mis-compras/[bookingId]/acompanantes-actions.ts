'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { safeError } from '@/lib/errors'
import { adminsDeAgencia, notificar } from '@/lib/push/send'

// b040: el comprador captura a sus acompañantes (pasajeros) tras el primer
// pago. Guards (propiedad, status, tope num_pax) viven en los RPCs DEFINER;
// escriben en booking_passengers (F3) — el agente los ve en /ventas y en el
// manifiesto de la salida.

export async function agregarAcompanante(input: {
  bookingId: string
  nombre: string
  tipo?: string
  doc?: string
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_my_passenger' as never, {
    p_booking_id: input.bookingId,
    p_full_name: input.nombre,
    p_type: input.tipo?.trim() || null,
    p_doc: input.doc?.trim() || null,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo agregar al viajero.') }
  revalidatePath(`/mis-compras/${input.bookingId}`)

  // b036: al COMPLETARSE la lista (N/N) se avisa a la agencia — lista de
  // abordaje lista. No se notifica por cada alta (5 pax = 5 pushes = ruido).
  // Best-effort: nunca rompe la captura.
  try {
    const svc = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: b } = await (svc as any)
      .from('bookings')
      .select('selling_supplier_id, num_pax, customer:customers(full_name), service:services(name)')
      .eq('id', input.bookingId)
      .maybeSingle()
    if (b?.selling_supplier_id && b.num_pax > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (svc as any)
        .from('booking_passengers')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', input.bookingId)
      if ((count ?? 0) >= b.num_pax) {
        await notificar(await adminsDeAgencia(b.selling_supplier_id), {
          title: 'Lista de viajeros completa',
          body: `${b.customer?.full_name ?? 'Comprador'} registró a sus ${b.num_pax} viajeros de "${b.service?.name ?? 'viaje'}".`,
          url: `/ventas/${input.bookingId}`,
        })
      }
    }
  } catch {
    /* best-effort */
  }
  return { ok: true }
}

export async function quitarAcompanante(
  bookingId: string,
  passengerId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_my_passenger' as never, {
    p_passenger_id: passengerId,
  } as never)
  if (error) return { error: safeError(error, 'No se pudo quitar al viajero.') }
  revalidatePath(`/mis-compras/${bookingId}`)
  return { ok: true }
}
