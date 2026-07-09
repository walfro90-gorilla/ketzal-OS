'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function convertirCotizacion(
  bookingId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // El RPC valida que la cotización exista, sea de tu agencia (RLS)
  // y siga en 'draft'; si no, levanta un error descriptivo.
  const { error } = await supabase.rpc('convert_quote_to_sale', {
    p_booking_id: bookingId,
  })
  if (error) return { error: error.message }

  revalidatePath('/cotizaciones')
  revalidatePath('/ventas')
  return { ok: true }
}
