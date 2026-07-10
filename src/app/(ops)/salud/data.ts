import { createClient } from '@/lib/supabase/server'

export type SaludEvento = {
  ts: string
  source: string
  level: 'info' | 'warn' | 'error' | 'critical'
  event: string
  detail: unknown
}

export type SaludData = {
  eventos: SaludEvento[]
  invariantes: {
    violaciones: number
    detalle: { check: string; booking_id: string; detalle: string }[]
  }
}

// Lee ketzal.salud_sistema() (superadmin). RPC no tipado (otro flujo edita
// database.types.ts) → cast puntual. Devuelve null si no hay acceso (el RPC
// lanza para no-superadmin) o error.
export async function getSalud(): Promise<SaludData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('salud_sistema' as never)
  if (error || data == null) return null
  return data as unknown as SaludData
}
