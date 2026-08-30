'use server'

import { createClient } from '@/lib/supabase/server'

// El tour se marcaba visto en localStorage, o sea por DISPOSITIVO: reaparecía en
// cada navegador y nadie sabía quién ya lo había pasado. `profiles.onboarded_at`
// (m005) lo hace por usuario. `profiles` es RPC-only-write desde b017 (GRANT +
// policy sin columnas = ponerse role='superadmin' por PATCH), así que la marca
// va por RPC DEFINER, no por update directo.

export async function marcarTourVisto(): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('marcar_onboarding_visto' as never)
  } catch {
    // Best-effort: si falla, el respaldo en localStorage evita que el tour se
    // vuelva molesto. Nunca debe romper la pantalla por esto.
  }
}
